import fs from 'node:fs'
import os from 'node:os'
import * as core from '@actions/core'
import { Config } from './config.ts'
import { Runner } from './runner.ts'
import { Setup } from './setup.ts'

const event = (file: string | undefined): unknown =>
  file !== undefined && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}

const main = async () => {
  const inputs = Object.fromEntries(Config.INPUTS.map((name) => [name, core.getInput(name)])) as Config.Inputs
  const config = Config.parse(inputs)
  const runner = Runner.parse(process.env, event(process.env.GITHUB_EVENT_PATH), os.homedir())
  await Setup.run(config, runner)
}

main().then(
  () => process.exit(0),
  (error) => {
    core.setFailed(error.message)
    process.exit(1)
  },
)
