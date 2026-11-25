import fs from 'node:fs'
import path from 'node:path'
import { Files } from './files.ts'

export interface Store {
  dirs: Store.Dirs
  delta: string
  unused: string
  manifest: string
  role: Store.Role
  save: boolean
  keys: Record<Store.Role, string>
}

export namespace Store {
  export const KINDS = ['blob', 'strong', 'weak'] as const

  export type Kind = (typeof KINDS)[number]
  export type Dirs = Record<Kind, string>
  export type Role = 'base' | 'delta'
  export type Entry = { kind: Kind; name: string; used: number }
  export type Cut = { since: number; prune: boolean }

  export const GRACE = 600_000

  export const paths = (dirs: Dirs): string[] => KINDS.map((kind) => dirs[kind])

  export const under = (root: string): Dirs => ({
    blob: path.join(root, 'blob'),
    strong: path.join(root, 'strong'),
    weak: path.join(root, 'weak'),
  })

  export const id = (entry: Entry): string => `${entry.kind}/${entry.name}`

  const names = (kind: Kind, dir: string): string[] =>
    kind === 'blob'
      ? Files.list(dir).flatMap((digest) => Files.list(path.join(dir, digest)).map((file) => `${digest}/${file}`))
      : Files.list(dir)

  const clock = (kind: Kind, name: string): string => (kind === 'blob' ? path.dirname(name) : name)

  export const ids = (dirs: Dirs): string[] =>
    KINDS.flatMap((kind) => names(kind, dirs[kind]).map((name) => `${kind}/${name}`))

  export function scan(dirs: Dirs): Entry[] {
    const entries: Entry[] = []
    for (const kind of KINDS) {
      for (const name of names(kind, dirs[kind])) {
        const stat = fs.lstatSync(path.join(dirs[kind], clock(kind, name)), { throwIfNoEntry: false })
        if (stat !== undefined) entries.push({ kind, name, used: stat.mtimeMs })
      }
    }
    return entries
  }

  const used = (entry: Entry, cut: Cut): boolean => entry.used >= cut.since

  export function split(entries: Entry[], cut: Cut): { live: Entry[]; stale: Entry[] } {
    const live: Entry[] = []
    const stale: Entry[] = []
    for (const entry of entries) (cut.prune && !used(entry, cut) ? stale : live).push(entry)
    return { live, stale }
  }

  export const delta = (entries: Entry[], base: Set<string>, cut: Cut): Entry[] =>
    entries.filter((entry) => {
      if (entry.kind === 'weak' && used(entry, cut)) return true
      return !base.has(id(entry)) && (used(entry, cut) || !cut.prune)
    })

  function move(entry: Entry, from: Dirs, to: Dirs): boolean {
    const source = path.join(from[entry.kind], entry.name)
    const target = path.join(to[entry.kind], entry.name)
    if (entry.kind !== 'blob') return Files.move(source, target)
    const home = path.dirname(target)
    const held = fs.lstatSync(home, { throwIfNoEntry: false })?.mtimeMs ?? 0
    fs.mkdirSync(home, { recursive: true })
    const moved = Files.move(source, target)
    if (moved) Files.stamp(home, Math.max(held, entry.used))
    Files.reap(moved ? path.dirname(source) : home)
    return moved
  }

  export function shift(entries: Entry[], from: Dirs, to: Dirs): Entry[] {
    for (const kind of KINDS) fs.mkdirSync(to[kind], { recursive: true })
    return entries.filter((entry) => move(entry, from, to))
  }

  export function merge(from: Dirs, to: Dirs): void {
    const fresh = scan(from).filter(
      (entry) => entry.kind === 'weak' || !fs.existsSync(path.join(to[entry.kind], entry.name)),
    )
    shift(fresh, from, to)
  }

  export function remember(store: Store): void {
    fs.mkdirSync(path.dirname(store.manifest), { recursive: true })
    fs.writeFileSync(store.manifest, JSON.stringify(ids(store.dirs)))
  }

  export function recall(store: Store): Set<string> {
    try {
      return new Set(JSON.parse(fs.readFileSync(store.manifest, 'utf8')) as string[])
    } catch {
      return new Set()
    }
  }
}
