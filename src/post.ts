import * as core from '@actions/core'
import { Config } from './config.ts'
import { Save } from './save.ts'
import { State } from './state.ts'

const main = async () => {
  const state = State.parse(core.getState(State.NAME))
  if (state !== undefined) await Save.run(state, Config.succeeded(core.getInput(Config.STATUS)))
}

main().then(
  () => process.exit(0),
  (error) => {
    core.warning(error.message)
    process.exit(0)
  },
)
