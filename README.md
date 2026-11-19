# spn-action

Installs [spn](https://github.com/boonbane/spn) on a GitHub Actions runner and caches its toolchains and build cache between runs.

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: boonbane/spn-action@v1
    with:
      version: 0.12.0
  - run: spn test
```

It needs spn 0.12.0 or newer, and runs wherever spn ships a build: Linux x86_64, macOS arm64 and Windows x86_64.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `version` | required | The release to install, like `0.12.0`. `latest` and `canary` also work |
| `cache` | `true` | Cache spn's storage between runs |
| `cache-key` | | Extra cache key component, for matrix legs that share a job id, an OS and an architecture |
| `save` | `auto` | Whether this run saves the build cache. `auto` saves on pushes to the default branch only; `true` and `false` force it |

The `version` output is what `spn --version` printed.

## Caching

The action sets `SPN_STORAGE_DIR` to `$RUNNER_TEMP/spn`, unless the workflow already set it, and keeps two caches per job:

- Downloaded toolchains, saved again whenever a run ends with a different set of them than it restored.
- The build cache, compiled runtime libraries, dependency checkouts and indexes. Pushes to the default branch save it; every other run restores the newest one and saves nothing.

When the job ends, a run that saves first runs `spn clean --cache --min-age` with the time since setup, which evicts whatever the job didn't use. The build cache therefore holds what one build needed. A job that failed saves nothing.

Each job keeps its own cache, keyed on the OS, architecture, spn version and job id. Matrix legs that share all of those share one cache that only the first to finish saves, so give each one a `cache-key`:

```yaml
strategy:
  matrix:
    profile: [debug, sanitizer]
steps:
  - uses: boonbane/spn-action@v1
    with:
      version: 0.12.0
      cache-key: ${{ matrix.profile }}
  - run: spn test --profile ${{ matrix.profile }}
```

spn's build cache keys include absolute paths, so a cache only hits when the checkout and the storage directory sit at the same paths as in the run that saved it. That holds on GitHub-hosted runners. It doesn't hold across self-hosted runners with different work directories.

## Development

The runner executes the bundles in `dist/`, which are committed. After changing anything under `src/`:

```
bun install
bun run typecheck
bun run test
bun run build
```

- `src/plan.ts`, `src/config.ts` and `src/runner.ts` decide what to install and cache, and touch nothing.
- `src/setup.ts` and `src/save.ts` carry that out with the Actions toolkit.
- `src/main.ts` and `src/post.ts` are the two entry points.
