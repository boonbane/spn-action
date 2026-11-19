import fs from 'node:fs'
import path from 'node:path'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import type { Config } from './config.ts'
import { Plan } from './plan.ts'
import type { Runner } from './runner.ts'
import { State } from './state.ts'

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

  export async function run(config: Config, runner: Runner): Promise<void> {
    const plan = Plan.install(config, runner)
    await install(plan)

    const version = (await getExecOutput(plan.spn, ['--version'])).stdout.trim()
    core.setOutput('version', version)

    const caches = Plan.caches(config, runner, version)
    if (caches.length === 0) return
    if (!cache.isFeatureAvailable()) {
      core.warning('the cache service is not available; continuing without it')
      return
    }

    const storage = Plan.storage(runner)
    core.exportVariable('SPN_STORAGE_DIR', storage)

    const entries: State.Entry[] = []
    for (const entry of caches) {
      entries.push({ ...entry, hit: await cache.restoreCache(entry.paths, entry.key, entry.restore) })
    }
    const state: State = { spn: plan.spn, storage, cwd: runner.temp, started: Date.now(), caches: entries }
    core.saveState(State.NAME, State.format(state))
  }
}
