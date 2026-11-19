import { expect } from 'bun:test'
import type { Config } from '../src/config.ts'
import { Plan } from '../src/plan.ts'
import type { Runner } from '../src/runner.ts'
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

type Caches = {
  name: string
  config?: Partial<Config>
  runner?: Partial<Runner>
  version?: string
  expect: Plan.Cache[]
}

type Change = { prefix?: string; toolchain?: Partial<Plan.Cache>; build?: Partial<Plan.Cache> }

const PREFIX = 'spn-action-Linux-X64-spn-0.12.0-J-'

const restores = { build: { save: false } }

const expected = (change: Change = {}): Plan.Cache[] => {
  const prefix = change.prefix ?? PREFIX
  return [
    {
      name: 'toolchain',
      paths: ['/t/spn/toolchain/store'],
      key: `${prefix}-toolchain-`,
      restore: [`${prefix}-toolchain-`],
      save: true,
      prune: false,
      digest: true,
      ...change.toolchain,
    },
    {
      name: 'build',
      paths: [
        '/t/spn/store/blob',
        '/t/spn/store/strong',
        '/t/spn/store/weak',
        '/t/spn/src',
        '/t/spn/db',
        '/t/spn/index',
        '/t/spn/toolchain/work',
      ],
      key: `${prefix}-build-7-1`,
      restore: [`${prefix}-build-`],
      save: true,
      prune: true,
      digest: false,
      ...change.build,
    },
  ]
}

const caches: Caches[] = [
  { name: 'a push to the default branch saves', expect: expected() },
  {
    name: 'a pull request only restores',
    runner: { event: 'pull_request', ref: 'refs/pull/1/merge' },
    expect: expected(restores),
  },
  { name: 'a push to another branch only restores', runner: { ref: 'refs/heads/x' }, expect: expected(restores) },
  { name: 'a tag named like the default branch only restores', runner: { ref: 'refs/tags/main' }, expect: expected(restores) },
  {
    name: 'save can be forced on',
    config: { save: true },
    runner: { event: 'pull_request', ref: 'refs/pull/1/merge' },
    expect: expected(),
  },
  { name: 'save can be forced off', config: { save: false }, expect: expected(restores) },
  {
    name: 'the cache key separates legs',
    config: { key: 'debug' },
    expect: expected({ prefix: 'spn-action-Linux-X64-spn-0.12.0-J-debug' }),
  },
  {
    name: 'a version is made safe for a key',
    version: 'spn 0.12.0 (dev)',
    expect: expected({ prefix: 'spn-action-Linux-X64-spn-0.12.0-dev-J-' }),
  },
  {
    name: 'storage from the environment',
    runner: { storage: '/s' },
    expect: expected({
      toolchain: { paths: ['/s/toolchain/store'] },
      build: {
        paths: ['/s/store/blob', '/s/store/strong', '/s/store/weak', '/s/src', '/s/db', '/s/index', '/s/toolchain/work'],
      },
    }),
  },
  {
    name: 'a toolchain directory of its own',
    runner: { toolchain: '/c' },
    expect: expected({
      toolchain: { paths: ['/c/store'] },
      build: {
        paths: [
          '/t/spn/store/blob',
          '/t/spn/store/strong',
          '/t/spn/store/weak',
          '/t/spn/src',
          '/t/spn/db',
          '/t/spn/index',
          '/c/work',
        ],
      },
    }),
  },
  {
    name: 'windows paths',
    runner: windows,
    expect: expected({
      prefix: 'spn-action-Windows-X64-spn-0.12.0-J-',
      toolchain: { paths: ['D:\\a\\_temp\\spn\\toolchain\\store'] },
      build: {
        paths: [
          'D:\\a\\_temp\\spn\\store\\blob',
          'D:\\a\\_temp\\spn\\store\\strong',
          'D:\\a\\_temp\\spn\\store\\weak',
          'D:\\a\\_temp\\spn\\src',
          'D:\\a\\_temp\\spn\\db',
          'D:\\a\\_temp\\spn\\index',
          'D:\\a\\_temp\\spn\\toolchain\\work',
        ],
      },
    }),
  },
  { name: 'with the cache off there is nothing to cache', config: { cache: false }, expect: [] },
]

Testing.each('Plan.caches', caches, (it) => {
  const config = { ...Testing.config, ...it.config }
  const runner = { ...Testing.runner, ...it.runner }
  expect(Plan.caches(config, runner, it.version ?? 'spn 0.12.0')).toEqual(it.expect)
})
