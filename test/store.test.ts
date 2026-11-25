import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'bun:test'
import { Store } from '../src/store.ts'
import { Testing } from './testing.ts'

const SINCE = 1_000_000

const old = SINCE - 1
const now = SINCE + 1

const PAST = 2_000_000
const LATER = 3_000_000

const disk = Testing.sandbox()
const memory = Testing.sandbox()

const entry = (id: string, used: number): Store.Entry => {
  const [kind, ...rest] = id.split('/') as [Store.Kind, ...string[]]
  return { kind, name: rest.join('/'), used }
}

const names = (entries: Store.Entry[]): string[] => entries.map(Store.id)

type Split = { name: string; entries: Store.Entry[]; prune: boolean; live: string[]; stale: string[] }

const splits: Split[] = [
  {
    name: 'what the job used is live and the rest is stale',
    entries: [entry('blob/a/a.o', now), entry('blob/b/b.o', old), entry('strong/c', old), entry('weak/d', now)],
    prune: true,
    live: ['blob/a/a.o', 'weak/d'],
    stale: ['blob/b/b.o', 'strong/c'],
  },
  {
    name: 'an entry used exactly at the cut is live',
    entries: [entry('blob/a/a.o', SINCE)],
    prune: true,
    live: ['blob/a/a.o'],
    stale: [],
  },
  {
    name: 'a job that failed prunes nothing',
    entries: [entry('blob/a/a.o', now), entry('blob/b/b.o', old)],
    prune: false,
    live: ['blob/a/a.o', 'blob/b/b.o'],
    stale: [],
  },
]

Testing.each('Store.split', splits, (it) => {
  const { live, stale } = Store.split(it.entries, { since: SINCE, prune: it.prune })
  expect(names(live)).toEqual(it.live)
  expect(names(stale)).toEqual(it.stale)
})

type Delta = { name: string; entries: Store.Entry[]; base: string[]; prune: boolean; expect: string[] }

const deltas: Delta[] = [
  {
    name: 'what the base already holds is left out',
    entries: [entry('blob/a/a.o', now), entry('blob/b/b.o', now), entry('strong/c', now), entry('strong/d', now)],
    base: ['blob/a/a.o', 'strong/c'],
    prune: true,
    expect: ['blob/b/b.o', 'strong/d'],
  },
  {
    name: 'a file added to a blob the base holds is kept',
    entries: [entry('blob/a/a.o', now), entry('blob/a/log.txt', now)],
    base: ['blob/a/a.o'],
    prune: true,
    expect: ['blob/a/log.txt'],
  },
  {
    name: 'what the job did not use is left out',
    entries: [entry('blob/a/a.o', old), entry('strong/b', old), entry('weak/c', old)],
    base: [],
    prune: true,
    expect: [],
  },
  {
    name: 'a weak entry the job used is kept even when the base holds it',
    entries: [entry('weak/a', now), entry('weak/b', old)],
    base: ['weak/a', 'weak/b'],
    prune: true,
    expect: ['weak/a'],
  },
  {
    name: 'a job that failed keeps what an earlier delta held',
    entries: [entry('blob/a/a.o', old), entry('blob/b/b.o', old), entry('weak/c', old), entry('weak/d', now)],
    base: ['blob/a/a.o', 'weak/d'],
    prune: false,
    expect: ['blob/b/b.o', 'weak/c', 'weak/d'],
  },
]

Testing.each('Store.delta', deltas, (it) => {
  const picked = Store.delta(it.entries, new Set(it.base), { since: SINCE, prune: it.prune })
  expect(names(picked)).toEqual(it.expect)
})

Testing.each('Store on disk', [{ name: 'entries are scanned, set aside, put back and merged' }], () => {
  const root = disk
  const dirs = Store.under(path.join(root, 'store'))
  const aside = Store.under(path.join(root, 'aside'))
  const staged = Store.under(path.join(root, 'staged'))

  Testing.file(root, 'store/blob/a/a.o', PAST)
  Testing.file(root, 'store/strong/b.txt', PAST)
  Testing.file(root, 'store/weak/c.txt', PAST)

  const entries = Store.scan(dirs)
  expect(names(entries).toSorted()).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.ids(dirs).toSorted()).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(entries.map((it) => it.used)).toEqual([PAST, PAST, PAST])

  const moved = Store.shift(entries, dirs, aside)
  expect(moved).toEqual(entries)
  expect(Testing.files(path.join(root, 'store'))).toEqual([])
  expect(fs.existsSync(path.join(dirs.blob, 'a'))).toEqual(false)
  expect(Testing.files(path.join(root, 'aside'))).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.scan(aside).map((it) => it.used)).toEqual([PAST, PAST, PAST])
  expect(Store.shift(entries, dirs, aside)).toEqual([])

  Store.shift(moved, aside, dirs)
  expect(Testing.files(path.join(root, 'store'))).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.scan(dirs).map((it) => it.used)).toEqual([PAST, PAST, PAST])

  Testing.file(root, 'staged/blob/a/a.o', LATER)
  Testing.file(root, 'staged/blob/a/log.txt', LATER)
  Testing.file(root, 'staged/blob/d/d.o', PAST)
  Testing.file(root, 'staged/strong/b.txt', LATER)
  Testing.file(root, 'staged/strong/e.txt')
  Testing.file(root, 'staged/weak/c.txt', LATER)
  Store.merge(staged, dirs)
  expect(Testing.files(path.join(root, 'store'))).toEqual([
    'blob/a/a.o',
    'blob/a/log.txt',
    'blob/d/d.o',
    'strong/b.txt',
    'strong/e.txt',
    'weak/c.txt',
  ])
  const merged = Object.fromEntries(Store.scan(dirs).map((it) => [Store.id(it), it.used]))
  expect(merged['blob/a/a.o']).toEqual(LATER)
  expect(merged['blob/a/log.txt']).toEqual(LATER)
  expect(merged['blob/d/d.o']).toEqual(PAST)
  expect(merged['strong/b.txt']).toEqual(PAST)
  expect(merged['weak/c.txt']).toEqual(LATER)
  expect(Testing.files(path.join(root, 'staged'))).toEqual(['blob/a/a.o', 'strong/b.txt'])
})

Testing.each('Store.recall', [{ name: 'what was remembered, or nothing' }], () => {
  const root = memory
  const store: Store = {
    dirs: Store.under(path.join(root, 'store')),
    delta: path.join(root, 'side', 'delta'),
    unused: path.join(root, 'side', 'unused'),
    manifest: path.join(root, 'side', 'base.json'),
    role: 'delta',
    save: true,
    keys: { base: 'B-', delta: 'D-' },
  }
  expect(Store.recall(store)).toEqual(new Set())
  Testing.file(root, 'store/blob/a/a.o')
  Testing.file(root, 'store/weak/b.txt')
  Store.remember(store)
  expect(Store.recall(store)).toEqual(new Set(['blob/a/a.o', 'weak/b.txt']))
})
