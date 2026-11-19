import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, test } from 'bun:test'
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

  export const config: Config = { version: '0.12.0', cache: true, key: '', save: 'auto', matrix: 'null' }

  export const runner: Runner = {
    os: 'Linux',
    arch: 'X64',
    temp: '/t',
    home: '/h',
    job: 'J',
    event: 'push',
    ref: 'refs/heads/main',
    branch: 'main',
    storage: undefined,
    toolchain: undefined,
  }

  export function sandbox(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spn-action-'))
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }))
    return root
  }

  export function file(root: string, name: string, used?: number): void {
    const target = path.join(root, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, name)
    if (used === undefined) return
    fs.utimesSync(target, used / 1000, used / 1000)
    fs.utimesSync(path.dirname(target), used / 1000, used / 1000)
  }

  export const files = (root: string): string[] =>
    (fs.readdirSync(root, { recursive: true, withFileTypes: true }) as fs.Dirent[])
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
      .toSorted()
}
