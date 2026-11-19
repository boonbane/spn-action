import path from 'node:path'
import { Files } from './files.ts'

export namespace Zig {
  const OBJECT = /\.(o|obj)$/

  const caches = (work: string): string[] => Files.tree(path.join(work, 'zig'), 1)

  export const runtime = (names: string[]): boolean => names.some((name) => !OBJECT.test(name))

  export const runtimes = (work: string): string[] =>
    caches(work).flatMap((cache) =>
      Files.list(path.join(cache, 'o'))
        .filter((hash) => runtime(Files.list(path.join(cache, 'o', hash))))
        .map((hash) => `${path.basename(cache)}/${hash}`),
    )

  export function sweep(work: string): void {
    for (const cache of caches(work)) {
      for (const scratch of Files.tree(path.join(cache, 'tmp'), 1)) Files.remove(scratch)
    }
  }
}
