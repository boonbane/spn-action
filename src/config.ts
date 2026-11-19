export interface Config {
  version: string
  cache: boolean
  key: string
  save: Config.Save
}

export namespace Config {
  export const INPUTS = ['version', 'cache', 'cache-key', 'save'] as const

  export type Input = (typeof INPUTS)[number]
  export type Inputs = Record<Input, string>
  export type Save = boolean | 'auto'

  const flags = { true: true, false: false } as const
  const saves = { auto: 'auto', ...flags } as const

  function choice<T>(inputs: Inputs, name: Input, allowed: Record<string, T>): T {
    const value = inputs[name]
    if (Object.hasOwn(allowed, value)) return allowed[value] as T
    throw new Error(`${name} must be one of ${Object.keys(allowed).join(', ')}, not '${value}'`)
  }

  export function parse(inputs: Inputs): Config {
    if (inputs.version === '') throw new Error('the version input is required')
    return {
      version: inputs.version,
      cache: choice(inputs, 'cache', flags),
      key: inputs['cache-key'],
      save: choice<Save>(inputs, 'save', saves),
    }
  }
}
