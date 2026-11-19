import type { Plan } from './plan.ts'

export interface State {
  started: number
  caches: Plan.Caches
  hits: State.Hits
}

export namespace State {
  export const NAME = 'spn-action'

  export type Hits = Record<string, string | undefined>

  export const format = (state: State): string => JSON.stringify(state)

  export const parse = (text: string): State | undefined => (text === '' ? undefined : (JSON.parse(text) as State))
}
