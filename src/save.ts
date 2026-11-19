import { createHash } from 'node:crypto'
import fs from 'node:fs'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import { exec } from '@actions/exec'
import type { State } from './state.ts'

export namespace Save {
  export const digest = (names: string[]): string =>
    createHash('sha256').update(names.toSorted().join('\n')).digest('hex').slice(0, 16)

  export function key(entry: State.Entry, names: string[]): string | undefined {
    const next = entry.digest ? `${entry.key}${digest(names)}` : entry.key
    return names.length === 0 || entry.hit?.toLowerCase() === next.toLowerCase() ? undefined : next
  }

  const list = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir) : [])

  async function prune(state: State): Promise<void> {
    const age = Math.max(1, Math.ceil((Date.now() - state.started) / 1000))
    await exec(state.spn, ['clean', '--cache', '--min-age', String(age)], {
      env: { ...process.env, SPN_STORAGE_DIR: state.storage } as Record<string, string>,
      cwd: state.cwd,
    })
  }

  async function save(state: State, entry: State.Entry): Promise<void> {
    if (!entry.save) return
    if (entry.prune) await prune(state)
    const next = key(entry, entry.paths.flatMap(list))
    if (next !== undefined) await cache.saveCache(entry.paths, next)
  }

  export async function run(state: State): Promise<void> {
    for (const entry of state.caches) {
      try {
        await save(state, entry)
      } catch (error) {
        core.warning(`the ${entry.name} cache was not saved: ${(error as Error).message}`)
      }
    }
  }
}
