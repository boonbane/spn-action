import fs from 'node:fs'
import path from 'node:path'
import { expect, mock } from 'bun:test'
import type { Config } from '../src/config.ts'
import { Plan } from '../src/plan.ts'
import type { Runner } from '../src/runner.ts'
import type { State } from '../src/state.ts'
import { Store } from '../src/store.ts'
import { Testing } from './testing.ts'

type Saved = { cache: string; key: string; files: string[] }

const saved: Saved[] = []

const archived = (dir: string): string[] =>
  fs.existsSync(dir) ? Testing.files(dir).map((file) => path.join(path.basename(dir), file)) : []

mock.module('@actions/cache', () => ({
  saveCache: async (paths: string[], key: string) => {
    saved.push({ cache: key.split('-')[1] ?? '', key, files: paths.flatMap(archived) })
    return 0
  },
}))

const { Save } = await import('../src/save.ts')

const NOW = Math.floor(Date.now() / 1000) * 1000
const OLD = NOW - 86_400_000

const pull: Partial<Runner> = { event: 'pull_request', ref: 'refs/pull/1/merge' }

type Files = Record<string, number>

type Case = {
  name: string
  runner?: Partial<Runner>
  save?: Config.Save
  succeeded: boolean
  base?: Files
  files: Files
  expect: Record<string, string[]>
}

const store: Files = {
  'store/blob/a/a.o': NOW,
  'store/blob/x/x.o': OLD,
  'store/strong/a.txt': NOW,
  'store/strong/x.txt': OLD,
  'store/weak/a.txt': NOW,
  'store/weak/x.txt': OLD,
}

const built: Files = {
  'store/blob/n/n.o': NOW,
  'store/strong/n.txt': NOW,
  'store/weak/n.txt': NOW,
}

const shared: Files = {
  'toolchain/store/T/zig': OLD,
  'src/curl/1/a.c': OLD,
  'db/curl/1/HEAD': OLD,
  'index/spam/README.md': OLD,
}

const zig: Files = {
  'toolchain/work/zig/A/o/1/libc.a': NOW,
  'toolchain/work/zig/A/o/2/main.o': NOW,
  'toolchain/work/zig/A/tmp/t/scratch': NOW,
}

const listed: Case[] = [
  {
    name: 'a run on the default branch saves what it used as the base',
    succeeded: true,
    files: { ...store, ...shared, ...zig },
    expect: {
      toolchain: ['store/T/zig'],
      source: ['src/curl/1/a.c', 'db/curl/1/HEAD', 'index/spam/README.md'],
      zig: ['work/zig/A/o/1/libc.a', 'work/zig/A/o/2/main.o'],
      base: ['blob/a/a.o', 'strong/a.txt', 'weak/a.txt'],
    },
  },
  {
    name: 'one that failed saves everything it has',
    succeeded: false,
    files: store,
    expect: {
      base: ['blob/a/a.o', 'blob/x/x.o', 'strong/a.txt', 'strong/x.txt', 'weak/a.txt', 'weak/x.txt'],
    },
  },
  {
    name: 'one that used nothing saves no base',
    succeeded: true,
    files: { 'store/blob/x/x.o': OLD, 'store/strong/x.txt': OLD },
    expect: {},
  },
  {
    name: 'a pull request saves what it used that the base lacks, and the weak entries it used',
    runner: pull,
    succeeded: true,
    base: store,
    files: { ...built, 'store/blob/y/y.o': OLD },
    expect: { delta: ['delta/blob/n/n.o', 'delta/strong/n.txt', 'delta/weak/a.txt', 'delta/weak/n.txt'] },
  },
  {
    name: 'one that built nothing the base lacks saves no delta',
    runner: pull,
    succeeded: true,
    base: store,
    files: {},
    expect: {},
  },
  {
    name: 'one that failed keeps what an earlier delta held',
    runner: pull,
    succeeded: false,
    base: store,
    files: { ...built, 'store/blob/y/y.o': OLD },
    expect: {
      delta: [
        'delta/blob/n/n.o',
        'delta/blob/y/y.o',
        'delta/strong/n.txt',
        'delta/weak/a.txt',
        'delta/weak/n.txt',
      ],
    },
  },
  {
    name: 'a run that does not save the build cache still saves toolchains and sources',
    save: false,
    succeeded: true,
    files: { ...store, ...shared, ...zig },
    expect: {
      toolchain: ['store/T/zig'],
      source: ['src/curl/1/a.c', 'db/curl/1/HEAD', 'index/spam/README.md'],
    },
  },
]

const cases = listed.map((it) => ({ ...it, root: Testing.sandbox() }))

const write = (root: string, files: Files): void => {
  for (const [name, used] of Object.entries(files)) Testing.file(root, name, used)
}

Testing.each('Save.run', cases, async (it) => {
  const config = { ...Testing.config, save: it.save ?? 'auto' }
  const caches = Plan.caches(config, { ...Testing.runner, ...it.runner, storage: it.root })
  if (caches === undefined) throw new Error('no caches')
  const state: State = { started: NOW, caches, hits: {} }

  write(it.root, it.base ?? {})
  if (it.base !== undefined) Store.remember(caches.store)
  write(it.root, it.files)
  const before = Testing.files(path.join(it.root, 'store'))

  saved.length = 0
  await Save.run(state, it.succeeded)
  expect(Object.fromEntries(saved.map((entry) => [entry.cache, entry.files]))).toEqual(it.expect)
  expect(Testing.files(path.join(it.root, 'store'))).toEqual(before)

  const hits = Object.fromEntries(saved.map((entry) => [entry.cache, entry.key]))
  saved.length = 0
  await Save.run({ ...state, hits }, it.succeeded)
  expect(saved).toEqual([])
})
