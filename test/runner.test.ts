import { expect } from 'bun:test'
import { Runner } from '../src/runner.ts'
import { Testing } from './testing.ts'

const vars: Runner.Vars = {
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  RUNNER_TEMP: '/t',
  GITHUB_JOB: 'J',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
}

const event = { repository: { default_branch: 'main' } }

type Case = { name: string; vars: Runner.Vars; event: unknown; expect: Runner }

const cases: Case[] = [
  { name: 'a runner', vars, event, expect: Testing.runner },
  {
    name: 'storage and toolchain come from the environment',
    vars: { ...vars, SPN_STORAGE_DIR: '/s', SPN_TOOLCHAIN_DIR: '/c' },
    event,
    expect: { ...Testing.runner, storage: '/s', toolchain: '/c' },
  },
  {
    name: 'a blank variable is unset',
    vars: { ...vars, SPN_STORAGE_DIR: '', SPN_TOOLCHAIN_DIR: '' },
    event,
    expect: Testing.runner,
  },
  {
    name: 'an event with no repository has no default branch',
    vars,
    event: {},
    expect: { ...Testing.runner, branch: '' },
  },
  { name: 'an event that is not an object', vars, event: null, expect: { ...Testing.runner, branch: '' } },
]

Testing.each('Runner.parse', cases, (it) => {
  expect(Runner.parse(it.vars, it.event, '/h')).toEqual(it.expect)
})

type Reject = { name: string; vars: Runner.Vars }

const rejects: Reject[] = [
  { name: 'not a runner', vars: {} },
  { name: 'a blank variable the runner must set', vars: { ...vars, RUNNER_TEMP: '' } },
]

Testing.each('Runner.parse rejects', rejects, (it) => {
  expect(() => Runner.parse(it.vars, event, '/h')).toThrow()
})
