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
  const [kind, name] = id.split('/') as [Store.Kind, string]
  return { kind, name, used }
}

const names = (entries: Store.Entry[]): string[] => entries.map(Store.id)

type Split = { name: string; entries: Store.Entry[]; prune: boolean; live: string[]; stale: string[] }

const splits: Split[] = [
  {
    name: 'what the job used is live and the rest is stale',
    entries: [entry('blob/a', now), entry('blob/b', old), entry('strong/c', old), entry('weak/d', now)],
    prune: true,
    live: ['blob/a', 'weak/d'],
    stale: ['blob/b', 'strong/c'],
  },
  {
    name: 'an entry used exactly at the cut is live',
    entries: [entry('blob/a', SINCE)],
    prune: true,
    live: ['blob/a'],
    stale: [],
  },
  {
    name: 'a job that failed prunes nothing',
    entries: [entry('blob/a', now), entry('blob/b', old)],
    prune: false,
    live: ['blob/a', 'blob/b'],
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
    entries: [entry('blob/a', now), entry('blob/b', now), entry('strong/c', now), entry('strong/d', now)],
    base: ['blob/a', 'strong/c'],
    prune: true,
    expect: ['blob/b', 'strong/d'],
  },
  {
    name: 'what the job did not use is left out',
    entries: [entry('blob/a', old), entry('strong/b', old), entry('weak/c', old)],
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
    entries: [entry('blob/a', old), entry('blob/b', old), entry('weak/c', old), entry('weak/d', now)],
    base: ['blob/a', 'weak/d'],
    prune: false,
    expect: ['blob/b', 'weak/c', 'weak/d'],
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
  expect(names(entries).toSorted()).toEqual(['blob/a', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.ids(dirs).toSorted()).toEqual(['blob/a', 'strong/b.txt', 'weak/c.txt'])
  expect(entries.find((it) => it.kind === 'strong')?.used).toEqual(PAST)

  const moved = Store.shift(entries, dirs, aside)
  expect(moved).toEqual(entries)
  expect(Testing.files(path.join(root, 'store'))).toEqual([])
  expect(Testing.files(path.join(root, 'aside'))).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.shift(entries, dirs, aside)).toEqual([])

  Store.shift(moved, aside, dirs)
  expect(Testing.files(path.join(root, 'store'))).toEqual(['blob/a/a.o', 'strong/b.txt', 'weak/c.txt'])
  expect(Store.scan(dirs).find((it) => it.kind === 'strong')?.used).toEqual(PAST)

  Testing.file(root, 'staged/blob/a/other.o')
  Testing.file(root, 'staged/blob/d/d.o')
  Testing.file(root, 'staged/strong/e.txt')
  Testing.file(root, 'staged/weak/c.txt', LATER)
  Store.merge(staged, dirs)
  expect(Testing.files(path.join(root, 'store'))).toEqual([
    'blob/a/a.o',
    'blob/d/d.o',
    'strong/b.txt',
    'strong/e.txt',
    'weak/c.txt',
  ])
  expect(Store.scan(dirs).find((it) => it.kind === 'weak')?.used).toEqual(LATER)
  expect(Testing.files(path.join(root, 'staged'))).toEqual(['blob/a/other.o'])
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
  expect(Store.recall(store)).toEqual(new Set(['blob/a', 'weak/b.txt']))
})
