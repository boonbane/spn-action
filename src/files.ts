import fs from 'node:fs'
import path from 'node:path'

export namespace Files {
  export function list(dir: string): string[] {
    try {
      return fs.readdirSync(dir)
    } catch {
      return []
    }
  }

  export const tree = (dir: string, depth: number): string[] =>
    list(dir).flatMap((name) => (depth > 1 ? tree(path.join(dir, name), depth - 1) : [path.join(dir, name)]))

  export function move(from: string, to: string): boolean {
    try {
      fs.renameSync(from, to)
      return true
    } catch {
      return false
    }
  }

  export function remove(target: string): void {
    try {
      fs.rmSync(target, { recursive: true, force: true })
    } catch {}
  }
}
