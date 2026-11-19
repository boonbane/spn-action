import { expect } from 'bun:test'
import type { Config } from '../src/config.ts'
import { Plan } from '../src/plan.ts'
import type { Runner } from '../src/runner.ts'
import type { Store } from '../src/store.ts'
import { Testing } from './testing.ts'

const RELEASES = 'https://github.com/boonbane/spn/releases'

const windows: Partial<Runner> = { os: 'Windows', temp: 'D:\\a\\_temp', home: 'C:\\Users\\u' }

type Release = { name: string; version: string; expect: string }

const releases: Release[] = [
  { name: 'the latest release', version: 'latest', expect: `${RELEASES}/latest/download` },
  { name: 'the canary', version: 'canary', expect: `${RELEASES}/download/canary` },
  { name: 'a version', version: '0.12.0', expect: `${RELEASES}/download/v0.12.0` },
  { name: 'a version written as its tag', version: 'v0.12.0', expect: `${RELEASES}/download/v0.12.0` },
]

Testing.each('Plan.release', releases, (it) => {
  expect(Plan.release(it.version)).toEqual(it.expect)
})

type Lineage = { name: string; a: [string, string, string]; b: [string, string, string]; same: boolean }

const lineages: Lineage[] = [
  { name: 'the same leg', a: ['J', 'null', ''], b: ['J', 'null', ''], same: true },
  { name: 'another job', a: ['J', 'null', ''], b: ['K', 'null', ''], same: false },
  { name: 'another matrix leg', a: ['J', '{"t":"a"}', ''], b: ['J', '{"t":"b"}', ''], same: false },
  { name: 'another cache key', a: ['J', 'null', ''], b: ['J', 'null', 'x'], same: false },
  { name: 'a job is not confused with a cache key', a: ['J', 'null', 'x'], b: ['Jx', 'null', ''], same: false },
]

Testing.each('Plan.lineage', lineages, (it) => {
  expect(Plan.lineage(...it.a) === Plan.lineage(...it.b)).toEqual(it.same)
})

type Change = {
  job?: string
  matrix?: string
  key?: string
  root?: string
  toolchain?: string
  store?: Partial<Store>
  save?: boolean
}

const expected = (change: Change = {}): Plan.Caches => {
  const host = 'Linux-X64'
  const job = change.job ?? 'J'
  const leg = `${host}-${job}-${Plan.lineage(job, change.matrix ?? 'null', change.key ?? '')}`
  const root = change.root ?? '/t/spn'
  const toolchain = change.toolchain ?? `${root}/toolchain`
  const save = change.save ?? true
  return {
    snapshots: [
      { name: 'toolchain', key: `spn-toolchain-${host}-`, dirs: [{ path: `${toolchain}/store`, depth: 1 }] },
      {
        name: 'source',
        key: `spn-source-${host}-`,
        dirs: [
          { path: `${root}/src`, depth: 2 },
          { path: `${root}/db`, depth: 2 },
          { path: `${root}/index`, depth: 1 },
        ],
      },
    ],
    zig: { work: `${toolchain}/work`, key: `spn-zig-${leg}-`, save },
    store: {
      dirs: { blob: `${root}/store/blob`, strong: `${root}/store/strong`, weak: `${root}/store/weak` },
      delta: `${root}/.action/delta`,
      unused: `${root}/.action/unused`,
      manifest: `${root}/.action/base.json`,
      role: 'base',
      save,
      keys: { base: `spn-base-${leg}-`, delta: `spn-delta-${leg}-` },
      ...change.store,
    },
  }
}

type Caches = {
  name: string
  config?: Partial<Config>
  runner?: Partial<Runner>
  expect: Plan.Caches | undefined
}

const caches: Caches[] = [
  { name: 'a push to the default branch saves the base', expect: expected() },
  {
    name: 'a pull request saves a delta',
    runner: { event: 'pull_request', ref: 'refs/pull/1/merge' },
    expect: expected({ store: { role: 'delta' } }),
  },
  {
    name: 'a push to another branch only restores',
    runner: { ref: 'refs/heads/x' },
    expect: expected({ save: false, store: { role: 'delta' } }),
  },
  {
    name: 'a tag named like the default branch only restores',
    runner: { ref: 'refs/tags/main' },
    expect: expected({ save: false, store: { role: 'delta' } }),
  },
  {
    name: 'another event on the default branch only restores',
    runner: { event: 'schedule' },
    expect: expected({ save: false }),
  },
  {
    name: 'save forced on another branch saves a delta',
    config: { save: true },
    runner: { ref: 'refs/heads/x' },
    expect: expected({ store: { role: 'delta' } }),
  },
  {
    name: 'save forced on the default branch saves the base',
    config: { save: true },
    runner: { event: 'schedule' },
    expect: expected(),
  },
  { name: 'save can be forced off', config: { save: false }, expect: expected({ save: false }) },
  {
    name: 'an event with no default branch is not on it',
    runner: { branch: '', ref: 'refs/heads/' },
    expect: expected({ save: false, store: { role: 'delta' } }),
  },
  {
    name: 'matrix legs keep their build caches apart',
    config: { matrix: '{"target":"a"}' },
    expect: expected({ matrix: '{"target":"a"}' }),
  },
  { name: 'the cache key keeps build caches apart', config: { key: 'debug' }, expect: expected({ key: 'debug' }) },
  { name: 'a job has its own build caches', runner: { job: 'K' }, expect: expected({ job: 'K' }) },
  { name: 'storage from the environment', runner: { storage: '/s' }, expect: expected({ root: '/s' }) },
  { name: 'a toolchain directory of its own', runner: { toolchain: '/c' }, expect: expected({ toolchain: '/c' }) },
  { name: 'with the cache off there is nothing to cache', config: { cache: false }, expect: undefined },
]

Testing.each('Plan.caches', caches, (it) => {
  const config = { ...Testing.config, ...it.config }
  const runner = { ...Testing.runner, ...it.runner }
  expect(Plan.caches(config, runner)).toEqual(it.expect)
})

Testing.each(
  'Plan.caches on windows',
  [{ name: 'paths use its separator' }],
  () => {
    const plan = Plan.caches(Testing.config, { ...Testing.runner, ...windows })
    expect(plan?.snapshots[0]?.dirs).toEqual([{ path: 'D:\\a\\_temp\\spn\\toolchain\\store', depth: 1 }])
    expect(plan?.zig.work).toEqual('D:\\a\\_temp\\spn\\toolchain\\work')
    expect(plan?.store.dirs.blob).toEqual('D:\\a\\_temp\\spn\\store\\blob')
    expect(plan?.store.delta).toEqual('D:\\a\\_temp\\spn\\.action\\delta')
    expect(plan?.store.keys.base.startsWith('spn-base-Windows-X64-J-')).toEqual(true)
  },
)
