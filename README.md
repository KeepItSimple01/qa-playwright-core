# @keepitsimple01/pw-core

Core Playwright testing framework — fixtures, i18n, features, env, logger, validation.

## Install

In your `package.json` dependencies:

```json
"@keepitsimple01/pw-core": "github:KeepItSimple01/qa-playwright-core"
```

Pin to a specific release tag:

```json
"@keepitsimple01/pw-core": "github:KeepItSimple01/qa-playwright-core#v0.1.0"
```

Then run `npm install`. No registry setup or tokens required.

## Development

```bash
npm ci              # install deps from lockfile
npm run build       # compile TypeScript → dist/
npm run typecheck   # type-check without emitting
npm run test        # typecheck + build
npm run clean       # remove dist/
```

## Usage

```ts
import {
  createTestFixtures,
  TAGS,
  withTags,
  ENV,
  loadFeatures,
  createLogger,
} from "@keepitsimple01/pw-core";
```

See [src/index.ts](src/index.ts) for the full public API surface.

## CLI

```bash
npx pw-core validate-test-cases <file> [--schemas-dir <dir>]
```

Validates a test-cases JSON file against the bundled schemas.

## Releasing

```bash
# 1. Verify everything from a clean state
git checkout master && git pull
rm -rf node_modules dist
npm ci
npm run typecheck
npm run build

# 2. Tag and push
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

Then create a GitHub Release from the tag via the GitHub UI (**Releases** > **Draft a new release**).

Consumer repos pin to the tag in their `package.json` and run `npm install` to update.

## License

[MIT](LICENSE)
