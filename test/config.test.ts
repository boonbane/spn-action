import { expect } from 'bun:test'
import { Config } from '../src/config.ts'
import { Testing } from './testing.ts'

const defaults: Config.Inputs = { version: '0.12.0', cache: 'true', 'cache-key': '', save: 'auto' }

type Case = { name: string; inputs: Partial<Config.Inputs>; expect: Config }

const cases: Case[] = [
  { name: 'defaults', inputs: {}, expect: Testing.config },
  { name: 'the cache can be turned off', inputs: { cache: 'false' }, expect: { ...Testing.config, cache: false } },
  { name: 'save can be forced on', inputs: { save: 'true' }, expect: { ...Testing.config, save: true } },
  { name: 'save can be forced off', inputs: { save: 'false' }, expect: { ...Testing.config, save: false } },
]

Testing.each('Config.parse', cases, (it) => {
  expect(Config.parse({ ...defaults, ...it.inputs })).toEqual(it.expect)
})

type Reject = { name: string; inputs: Partial<Config.Inputs> }

const rejects: Reject[] = [
  { name: 'no version', inputs: { version: '' } },
  { name: 'a save that is not one', inputs: { save: 'ture' } },
  { name: 'a cache that is not a flag', inputs: { cache: 'auto' } },
  { name: 'a property of every object is not a choice', inputs: { save: 'toString' } },
]

Testing.each('Config.parse rejects', rejects, (it) => {
  expect(() => Config.parse({ ...defaults, ...it.inputs })).toThrow()
})
