import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'bun:test'
import { Files } from '../src/files.ts'
import { Zig } from '../src/zig.ts'
import { Testing } from './testing.ts'

type Runtime = { name: string; names: string[]; expect: boolean }

const runtimes: Runtime[] = [
  { name: 'an object is not a runtime', names: ['main.o'], expect: false },
  { name: 'a windows object is not a runtime', names: ['main.obj'], expect: false },
  { name: 'an archive is', names: ['libc.a'], expect: true },
  { name: 'an import library is', names: ['libmingw32.lib'], expect: true },
  { name: 'a versioned shared library is', names: ['libc.so.6'], expect: true },
  { name: 'an archive beside an object is', names: ['libubsan_rt.a', 'libubsan_rt_zcu.o'], expect: true },
  { name: 'an empty directory is not', names: [], expect: false },
]

const cache = Testing.sandbox()
const sources = Testing.sandbox()

Testing.each('Zig.runtime', runtimes, (it) => {
  expect(Zig.runtime(it.names)).toEqual(it.expect)
})

Testing.each('Zig on disk', [{ name: 'runtimes are found and scratch is swept' }], () => {
  const work = cache
  expect(Zig.runtimes(work)).toEqual([])

  Testing.file(work, 'zig/A/o/1/main.o')
  Testing.file(work, 'zig/A/o/2/libc.a')
  Testing.file(work, 'zig/A/h/1.txt')
  Testing.file(work, 'zig/A/spn/generation')
  Testing.file(work, 'zig/B/o/3/libcompiler_rt.a')
  fs.mkdirSync(path.join(work, 'zig/A/tmp/x'), { recursive: true })
  fs.mkdirSync(path.join(work, 'zig/A/tmp/y'), { recursive: true })
  expect(Zig.runtimes(work).toSorted()).toEqual(['A/2', 'B/3'])

  Zig.sweep(work)
  expect(Files.list(path.join(work, 'zig/A/tmp'))).toEqual([])
  expect(Testing.files(work)).toEqual([
    'zig/A/h/1.txt',
    'zig/A/o/1/main.o',
    'zig/A/o/2/libc.a',
    'zig/A/spn/generation',
    'zig/B/o/3/libcompiler_rt.a',
  ])
})

Testing.each('Files.tree', [{ name: 'names at a depth, and nothing for what is not a directory' }], () => {
  const root = sources
  Testing.file(root, 'src/curl/1/a.c')
  Testing.file(root, 'src/curl/2/a.c')
  Testing.file(root, 'src/sp/3/sp.h')
  Testing.file(root, 'src/stray')
  expect(Files.tree(path.join(root, 'src'), 1).toSorted()).toEqual(
    ['curl', 'sp', 'stray'].map((name) => path.join(root, 'src', name)),
  )
  expect(Files.tree(path.join(root, 'src'), 2).toSorted()).toEqual(
    ['curl/1', 'curl/2', 'sp/3'].map((name) => path.join(root, 'src', name)),
  )
  expect(Files.tree(path.join(root, 'missing'), 2)).toEqual([])
})
