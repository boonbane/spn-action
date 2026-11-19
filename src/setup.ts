import fs from 'node:fs'
import path from 'node:path'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import type { Config } from './config.ts'
import { Files } from './files.ts'
import { Plan } from './plan.ts'
import type { Runner } from './runner.ts'
import { State } from './state.ts'
import { Store } from './store.ts'

export namespace Setup {
  const RETRY = { attempts: 5, wait: 15_000 }

  async function download(url: string, file: string): Promise<void> {
    const reply = await fetch(url)
    if (!reply.ok) throw new Error(`${url} answered ${reply.status}`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(await reply.arrayBuffer()))
  }

  async function install(plan: Plan.Install): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await download(plan.url, plan.script)
        await exec(plan.command[0]!, plan.command.slice(1), {
          env: { ...process.env, ...plan.env } as Record<string, string>,
        })
        return
      } catch (error) {
        if (attempt === RETRY.attempts) throw error
        core.warning(`install attempt ${attempt} of ${RETRY.attempts} failed: ${(error as Error).message}`)
        await new Promise((done) => setTimeout(done, RETRY.wait))
      }
    }
  }

  async function restore(name: string, paths: string[], key: string): Promise<string | undefined> {
    try {
      return await cache.restoreCache(paths, key, [key])
    } catch (error) {
      core.warning(`the ${name} cache was not restored: ${(error as Error).message}`)
      return undefined
    }
  }

  async function snapshots(entries: Plan.Snapshot[]): Promise<State.Hits> {
    const hits = await Promise.all(
      entries.map((entry) =>
        restore(
          entry.name,
          entry.dirs.map((dir) => dir.path),
          entry.key,
        ),
      ),
    )
    return Object.fromEntries(entries.map((entry, index) => [entry.name, hits[index]]))
  }

  async function store(entry: Store): Promise<State.Hits> {
    const layered = entry.role === 'delta' && entry.save
    const [base, delta] = await Promise.all([
      restore('base', Store.paths(entry.dirs), entry.keys.base),
      layered ? restore('delta', [entry.delta], entry.keys.delta) : undefined,
    ])
    if (layered) {
      Store.remember(entry)
      Store.merge(Store.under(entry.delta), entry.dirs)
      Files.remove(entry.delta)
    }
    return { base, delta }
  }

  export async function run(config: Config, runner: Runner): Promise<void> {
    const plan = Plan.install(config, runner)
    await install(plan)

    const version = (await getExecOutput(plan.spn, ['--version'])).stdout.trim()
    core.setOutput('version', version)

    const caches = Plan.caches(config, runner)
    if (caches === undefined) return
    if (!cache.isFeatureAvailable()) {
      core.warning('the cache service is not available; continuing without it')
      return
    }

    core.exportVariable('SPN_STORAGE_DIR', Plan.storage(runner))

    const started = Date.now()
    const [shared, zig, build] = await Promise.all([
      snapshots(caches.snapshots),
      restore('zig', [caches.zig.work], caches.zig.key),
      store(caches.store),
    ])
    core.saveState(State.NAME, State.format({ started, caches, hits: { ...shared, zig, ...build } }))
  }
}
