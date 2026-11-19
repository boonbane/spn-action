import { describe, test } from 'bun:test'
import type { Config } from '../src/config.ts'
import type { Runner } from '../src/runner.ts'

export namespace Testing {
  export const each = <T extends { name: string }>(
    suite: string,
    cases: T[],
    run: (it: T) => void | Promise<void>,
  ): void => {
    describe(suite, () => {
      for (const it of cases) test(it.name, () => run(it))
    })
  }

  export const config: Config = { version: '0.12.0', cache: true, key: '', save: 'auto' }

  export const runner: Runner = {
    os: 'Linux',
    arch: 'X64',
    temp: '/t',
    home: '/h',
    job: 'J',
    run: '7',
    attempt: '1',
    event: 'push',
    ref: 'refs/heads/main',
    branch: 'main',
    storage: undefined,
    toolchain: undefined,
  }
}
