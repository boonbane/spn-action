import { expect } from 'bun:test'
import { Save } from '../src/save.ts'
import type { State } from '../src/state.ts'
import { Testing } from './testing.ts'

type Case = { name: string; entry: State.Entry; names: string[]; expect: string | undefined }

const toolchain: State.Entry = {
  name: 'T',
  paths: ['/t'],
  key: 'T-',
  restore: ['T-'],
  save: true,
  prune: false,
  digest: true,
}
const build: State.Entry = { ...toolchain, name: 'B', paths: ['/b'], key: 'B-7-1', restore: ['B-'], digest: false }

const saved = (names: string[]): string => `T-${Save.digest(names)}`

const cases: Case[] = [
  { name: 'toolchains are saved under their digest', entry: toolchain, names: ['A'], expect: saved(['A']) },
  {
    name: 'toolchains that did not change are not saved again',
    entry: { ...toolchain, hit: saved(['A']) },
    names: ['A'],
    expect: undefined,
  },
  {
    name: 'the order they are listed in does not matter',
    entry: { ...toolchain, hit: saved(['A', 'B']) },
    names: ['B', 'A'],
    expect: undefined,
  },
  {
    name: 'a hit that only differs in case is still a hit',
    entry: { ...toolchain, hit: saved(['A']).toLowerCase() },
    names: ['A'],
    expect: undefined,
  },
  {
    name: 'another toolchain is saved along with the restored ones',
    entry: { ...toolchain, hit: saved(['A']) },
    names: ['A', 'B'],
    expect: saved(['A', 'B']),
  },
  { name: 'nothing on disk is not saved', entry: toolchain, names: [], expect: undefined },
  {
    name: 'a cache with no digest is saved under its own key',
    entry: { ...build, hit: 'B-6-1' },
    names: ['A'],
    expect: 'B-7-1',
  },
]

Testing.each('Save.key', cases, (it) => {
  expect(Save.key(it.entry, it.names)).toEqual(it.expect)
})
