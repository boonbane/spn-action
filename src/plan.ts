import { createHash } from 'node:crypto'
import type { Config } from './config.ts'
import { Runner } from './runner.ts'
import type { Store } from './store.ts'

export namespace Plan {
  export type Install = {
    url: string
    script: string
    command: string[]
    env: Record<string, string>
    spn: string
  }

  export type Dir = { path: string; depth: number }

  export type Snapshot = {
    name: string
    key: string
    dirs: Dir[]
  }

  export type Zig = {
    work: string
    key: string
    save: boolean
  }

  export type Caches = {
    snapshots: Snapshot[]
    zig: Zig
    store: Store
  }

  const RELEASES = 'https://github.com/boonbane/spn/releases'

  const channels: Record<string, string> = {
    latest: 'latest/download',
    canary: 'download/canary',
  }

  const installers = {
    unix: {
      script: 'install.sh',
      exe: 'spn',
      run: (file: string) => ['sh', file],
    },
    windows: {
      script: 'install.ps1',
      exe: 'spn.exe',
      run: (file: string) => ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
    },
  }

  export const release = (version: string): string =>
    `${RELEASES}/${channels[version] ?? `download/v${version.replace(/^v/, '')}`}`

  export function install(config: Config, runner: Runner): Install {
    const installer = installers[Runner.windows(runner) ? 'windows' : 'unix']
    const script = Runner.join(runner, runner.temp, `spn-${installer.script}`)
    return {
      url: `${release(config.version)}/${installer.script}`,
      script,
      command: installer.run(script),
      env: { SPN_INSTALL_AUTO: '1' },
      spn: Runner.join(runner, runner.home, '.spn', 'bin', installer.exe),
    }
  }

  export const storage = (runner: Runner): string => runner.storage ?? Runner.join(runner, runner.temp, 'spn')

  const slug = (text: string): string => text.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-$/, '')

  export const lineage = (job: string, matrix: string, key: string): string =>
    createHash('sha256').update(JSON.stringify([job, matrix, key])).digest('hex').slice(0, 8)

  const head = (runner: Runner): boolean => runner.branch !== '' && runner.ref === `refs/heads/${runner.branch}`

  const saves = (config: Config, runner: Runner): boolean =>
    config.save === 'auto' ? runner.event === 'pull_request' || (runner.event === 'push' && head(runner)) : config.save

  export function caches(config: Config, runner: Runner): Caches | undefined {
    if (!config.cache) return undefined
    const at = (...parts: string[]): string => Runner.join(runner, ...parts)
    const root = storage(runner)
    const toolchain = runner.toolchain ?? at(root, 'toolchain')
    const host = [runner.os, runner.arch].join('-')
    const leg = [host, slug(runner.job), lineage(runner.job, config.matrix, config.key)].join('-')
    const key = (cache: string, scope: string): string => `spn-${cache}-${scope}-`
    const save = saves(config, runner)
    return {
      snapshots: [
        { name: 'toolchain', key: key('toolchain', host), dirs: [{ path: at(toolchain, 'store'), depth: 1 }] },
        {
          name: 'source',
          key: key('source', host),
          dirs: [
            { path: at(root, 'src'), depth: 2 },
            { path: at(root, 'db'), depth: 2 },
            { path: at(root, 'index'), depth: 1 },
          ],
        },
      ],
      zig: { work: at(toolchain, 'work'), key: key('zig', leg), save },
      store: {
        dirs: {
          blob: at(root, 'store', 'blob'),
          strong: at(root, 'store', 'strong'),
          weak: at(root, 'store', 'weak'),
        },
        delta: at(root, '.action', 'delta'),
        unused: at(root, '.action', 'unused'),
        manifest: at(root, '.action', 'base.json'),
        role: head(runner) ? 'base' : 'delta',
        save,
        keys: { base: key('base', leg), delta: key('delta', leg) },
      },
    }
  }
}
