import path from 'node:path'

export interface Runner {
  os: string
  arch: string
  temp: string
  home: string
  job: string
  run: string
  attempt: string
  event: string
  ref: string
  branch: string
  storage: string | undefined
  toolchain: string | undefined
}

export namespace Runner {
  export type Vars = Record<string, string | undefined>

  const set = (value: string | undefined): string | undefined => (value === '' ? undefined : value)

  const branch = (event: unknown): string => {
    const repository = (event as { repository?: { default_branch?: unknown } } | null)?.repository
    return typeof repository?.default_branch === 'string' ? repository.default_branch : ''
  }

  export function parse(vars: Vars, event: unknown, home: string): Runner {
    const need = (name: string): string => {
      const value = set(vars[name])
      if (value === undefined) throw new Error(`${name} is not set; this only runs on a GitHub Actions runner`)
      return value
    }
    return {
      os: need('RUNNER_OS'),
      arch: need('RUNNER_ARCH'),
      temp: need('RUNNER_TEMP'),
      home,
      job: need('GITHUB_JOB'),
      run: need('GITHUB_RUN_ID'),
      attempt: need('GITHUB_RUN_ATTEMPT'),
      event: need('GITHUB_EVENT_NAME'),
      ref: vars.GITHUB_REF ?? '',
      branch: branch(event),
      storage: set(vars.SPN_STORAGE_DIR),
      toolchain: set(vars.SPN_TOOLCHAIN_DIR),
    }
  }

  export const windows = (runner: Runner): boolean => runner.os === 'Windows'

  export const join = (runner: Runner, ...parts: string[]): string =>
    (windows(runner) ? path.win32 : path.posix).join(...parts)
}
