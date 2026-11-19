import { expect } from 'bun:test'
import { Config } from '../src/config.ts'
import { Testing } from './testing.ts'

const defaults: Config.Inputs = {
  version: '0.12.0',
  cache: 'true',
  'cache-key': '',
  save: 'auto',
  'job-matrix': 'null',
}

type Case = { name: string; inputs: Partial<Config.Inputs>; expect: Config }

const cases: Case[] = [
  { name: 'defaults', inputs: {}, expect: Testing.config },
  { name: 'the cache can be turned off', inputs: { cache: 'false' }, expect: { ...Testing.config, cache: false } },
  { name: 'save can be forced on', inputs: { save: 'true' }, expect: { ...Testing.config, save: true } },
  { name: 'save can be forced off', inputs: { save: 'false' }, expect: { ...Testing.config, save: false } },
  { name: 'a cache key', inputs: { 'cache-key': 'k' }, expect: { ...Testing.config, key: 'k' } },
  {
    name: 'the matrix of the job',
    inputs: { 'job-matrix': '{"target":"a"}' },
    expect: { ...Testing.config, matrix: '{"target":"a"}' },
  },
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

type Status = { name: string; status: string; expect: boolean }

const statuses: Status[] = [
  { name: 'a job that succeeded', status: 'success', expect: true },
  { name: 'a job that failed', status: 'failure', expect: false },
  { name: 'a job that was cancelled', status: 'cancelled', expect: false },
  { name: 'a status the runner did not give', status: '', expect: false },
]

Testing.each('Config.succeeded', statuses, (it) => {
  expect(Config.succeeded(it.status)).toEqual(it.expect)
})
