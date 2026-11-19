# spn-action

This action installs [spn](https://github.com/boonbane/spn) on a GitHub Actions runner, configured such that it caches:
- Toolchains
- Checkouts of your dependencies' source code
- The build cache (object files, binaries, etc)

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: boonbane/spn-action@v1
    with:
      version: 0.12.0
  - run: spn build
```

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `version` | required | The release to install, like `0.12.0`. `latest` and `canary` also work |
| `cache` | `true` | Cache spn's storage between runs |
| `cache-key` | | Extra key component for the build cache, to keep jobs apart or to start one from scratch |
| `save` | `auto` | Whether this run saves the build cache. `auto` saves on pushes to the default branch and on pull requests; `true` and `false` force it |

## Caching

The action sets `SPN_STORAGE_DIR` to `$RUNNER_TEMP/spn`, unless the workflow already set it, and keeps five caches:

| Cache | Holds | Shared by | Saved when |
|---|---|---|---|
| toolchain | Downloaded toolchains | Every job on the OS | A toolchain is added |
| source | Dependency checkouts and indexes | Every job on the OS | A checkout is added |
| zig | The runtime libraries zig builds for a target | One leg | zig builds a new one |
| base | The default branch's build cache | One leg | The build used different entries |
| delta | What another ref built that the base lacks | One leg, one ref | The build used different entries |

Each cache is keyed on a digest of its contents, so it's only saved when it differs at the end of the run. Cancelled jobs don't update the cache.

The `save` key exists to allow you to control the saving of the caches that churn: The base build cache, the delta build cache, and the internal Zig cache (if using Zig). Whereas toolchains and dependency sources change infrequently, most builds will touch caches that hold object files, and you may not want the churn that comes with caching every object file from every CI build.

### Base and delta

To that end, this action separates the base and the delta. The *base* is the build cache for the default branch. A run on the default branch updates the base cache.

A PR run, for instance, would

A run on the default branch restores the base, and saves the entries its build used as the next one. Any other run, like a PR build, restores the default branch's base. If you configure the action to save PR builds, like it does by default, then it'll also restore its own newest delta on top.

A delta holds only the entries a build used that the base lacks, so a pull request uploads its own changes rather than the whole cache.  A pull request that falls behind still gets the newest base. A job that failed prunes nothing: it saves what it restored plus what it built

An entry counts as used when spn touched it during the job, or within the ten minutes before it

### Legs

- A leg is a job id and its matrix values, so the legs of a matrix keep separate build caches without configuration
- `cache-key` is for what the action can't see
- A reusable workflow called from a matrix sees no matrix of its own; pass the caller's values as its `cache-key`

```yaml
jobs:
  build:
    strategy:
      matrix:
        target: [x86_64-linux-musl, aarch64-linux-musl, x86_64-windows-gnu]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: boonbane/spn-action@v1
        with:
          version: 0.12.0
      - run: spn build --target ${{ matrix.target }}
```

### Limits

Most of these are limitations of `spn` being an alpha rather than of this action.

While it's in alpha, spn's build cache keys include absolute paths, which means that a cache only hits when the checkout and the storage directory are at the same paths as in the run that saved it. This is true on GitHub-hosted runners, but not generally.

Toolchain and source are never pruned, and so only grow.

If you're using the default Zig toolchain, Zig has its own cache which, unfortunately, can't be disabled. These are also saved alongside the `spn` cache. It's an alpha, baby!

## Development

The runner executes the bundles in `dist/`, which are committed. After changing anything under `src/`:

```
bun install
bun run typecheck
bun run test
bun run build
```
