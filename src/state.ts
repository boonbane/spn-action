import type { Plan } from './plan.ts'

export interface State {
  spn: string
  storage: string
  cwd: string
  started: number
  caches: State.Entry[]
}

export namespace State {
  export const NAME = 'spn-action'

  export type Entry = Plan.Cache & { hit?: string }

  export const format = (state: State): string => JSON.stringify(state)

  export const parse = (text: string): State | undefined => (text === '' ? undefined : (JSON.parse(text) as State))
}
