import path from 'node:path'

const root = path.join(import.meta.dir, '..')

const entries = ['main', 'post']

for (const name of entries) {
  await Bun.build({
    entrypoints: [path.join(root, 'src', `${name}.ts`)],
    outdir: path.join(root, 'dist', name),
    naming: 'index.js',
    target: 'node',
    format: 'cjs',
    minify: true,
  })
  console.log(`built dist/${name}/index.js`)
}
