import type { Config } from './config.ts'
import { Runner } from './runner.ts'

export namespace Plan {
  export type Install = {
    url: string
    script: string
    command: string[]
    env: Record<string, string>
    spn: string
  }

  export type Cache = {
    name: string
    paths: string[]
    key: string
    restore: string[]
    save: boolean
    prune: boolean
    digest: boolean
  }

  type Dirs = { storage: string[]; toolchain: string[] }

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

  const layout = {
    toolchain: { storage: [], toolchain: ['store'] },
    build: { storage: ['store/blob', 'store/strong', 'store/weak', 'src', 'db', 'index'], toolchain: ['work'] },
  } satisfies Record<string, Dirs>

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

  const saves = (config: Config, runner: Runner): boolean =>
    config.save === 'auto' ? runner.event === 'push' && runner.ref === `refs/heads/${runner.branch}` : config.save

  export function caches(config: Config, runner: Runner, version: string): Cache[] {
    if (!config.cache) return []
    const roots = {
      storage: storage(runner),
      toolchain: runner.toolchain ?? Runner.join(runner, storage(runner), 'toolchain'),
    }
    const under = (dirs: Dirs): string[] => [
      ...dirs.storage.map((dir) => Runner.join(runner, roots.storage, dir)),
      ...dirs.toolchain.map((dir) => Runner.join(runner, roots.toolchain, dir)),
    ]
    const prefix = ['spn-action', runner.os, runner.arch, slug(version), runner.job, config.key].join('-')
    return [
      {
        name: 'toolchain',
        paths: under(layout.toolchain),
        key: `${prefix}-toolchain-`,
        restore: [`${prefix}-toolchain-`],
        save: true,
        prune: false,
        digest: true,
      },
      {
        name: 'build',
        paths: under(layout.build),
        key: `${prefix}-build-${runner.run}-${runner.attempt}`,
        restore: [`${prefix}-build-`],
        save: saves(config, runner),
        prune: true,
        digest: false,
      },
    ]
  }
}
