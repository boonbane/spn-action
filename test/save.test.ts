import { expect } from 'bun:test'
import { Save } from '../src/save.ts'
import { Testing } from './testing.ts'

type Case = { name: string; hit?: string; names: string[]; expect: string | undefined }

const saved = (names: string[]): string => `C-${Save.digest(names)}`

const cases: Case[] = [
  { name: 'a cache is saved under the digest of its contents', names: ['A'], expect: saved(['A']) },
  { name: 'contents that did not change are not saved again', hit: saved(['A']), names: ['A'], expect: undefined },
  {
    name: 'the order they are listed in does not matter',
    hit: saved(['A', 'B']),
    names: ['B', 'A'],
    expect: undefined,
  },
  {
    name: 'a hit that only differs in case is still a hit',
    hit: saved(['A']).toLowerCase(),
    names: ['A'],
    expect: undefined,
  },
  {
    name: 'new contents are saved along with the restored ones',
    hit: saved(['A']),
    names: ['A', 'B'],
    expect: saved(['A', 'B']),
  },
  { name: 'contents that shrank are saved', hit: saved(['A', 'B']), names: ['A'], expect: saved(['A']) },
  { name: 'nothing on disk is not saved', names: [], expect: undefined },
]

Testing.each('Save.key', cases, (it) => {
  expect(Save.key('C-', it.hit, it.names)).toEqual(it.expect)
})
