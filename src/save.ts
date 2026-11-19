import { createHash } from 'node:crypto'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import { Files } from './files.ts'
import type { Plan } from './plan.ts'
import type { State } from './state.ts'
import { Store } from './store.ts'
import { Zig } from './zig.ts'

export namespace Save {
  type Job = { name: string; run: () => Promise<void> }

  export const digest = (names: string[]): string =>
    createHash('sha256').update(names.toSorted().join('\n')).digest('hex').slice(0, 16)

  export function key(prefix: string, hit: string | undefined, names: string[]): string | undefined {
    const next = `${prefix}${digest(names)}`
    return names.length === 0 || hit?.toLowerCase() === next.toLowerCase() ? undefined : next
  }

  async function snapshot(entry: Plan.Snapshot, hit: string | undefined): Promise<void> {
    const next = key(
      entry.key,
      hit,
      entry.dirs.flatMap((dir) => Files.tree(dir.path, dir.depth)),
    )
    if (next === undefined) return
    await cache.saveCache(
      entry.dirs.map((dir) => dir.path),
      next,
    )
  }

  async function zig(entry: Plan.Zig, hit: string | undefined): Promise<void> {
    if (!entry.save) return
    const next = key(entry.key, hit, Zig.runtimes(entry.work))
    if (next === undefined) return
    Zig.sweep(entry.work)
    await cache.saveCache([entry.work], next)
  }

  async function base(entry: Store, hit: string | undefined, cut: Store.Cut): Promise<void> {
    const { live, stale } = Store.split(Store.scan(entry.dirs), cut)
    const next = key(entry.keys.base, hit, live.map(Store.id))
    if (next === undefined) return
    const aside = Store.under(entry.unused)
    const moved = Store.shift(stale, entry.dirs, aside)
    try {
      await cache.saveCache(Store.paths(entry.dirs), next)
    } finally {
      Store.shift(moved, aside, entry.dirs)
    }
  }

  async function delta(entry: Store, hit: string | undefined, cut: Store.Cut): Promise<void> {
    const known = Store.recall(entry)
    const picked = Store.delta(Store.scan(entry.dirs), known, cut)
    const next = key(
      entry.keys.delta,
      hit,
      picked.map(Store.id).filter((id) => !known.has(id)),
    )
    if (next === undefined) return
    const staged = Store.under(entry.delta)
    const moved = Store.shift(picked, entry.dirs, staged)
    try {
      await cache.saveCache([entry.delta], next)
    } finally {
      Store.shift(moved, staged, entry.dirs)
    }
  }

  async function store(entry: Store, hits: State.Hits, cut: Store.Cut): Promise<void> {
    if (!entry.save) return
    if (entry.role === 'base') await base(entry, hits.base, cut)
    else await delta(entry, hits.delta, cut)
  }

  export async function run(state: State, succeeded: boolean): Promise<void> {
    const { caches, hits } = state
    const cut = { since: state.started - Store.GRACE, prune: succeeded }
    const jobs: Job[] = [
      ...caches.snapshots.map((entry) => ({ name: entry.name, run: () => snapshot(entry, hits[entry.name]) })),
      { name: 'zig', run: () => zig(caches.zig, hits.zig) },
      { name: 'build', run: () => store(caches.store, hits, cut) },
    ]
    await Promise.all(
      jobs.map(async (job) => {
        try {
          await job.run()
        } catch (error) {
          core.warning(`the ${job.name} cache was not saved: ${(error as Error).message}`)
        }
      }),
    )
  }
}
