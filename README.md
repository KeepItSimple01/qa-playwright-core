# @company/pw-core

Core Playwright testing framework — fixtures, i18n, features, env, logger, validation.

## Install

```bash
npm install @company/pw-core
```

> **Gitea registry:** see the [Publishing](#publishing-to-gitea-npm-registry) section below for registry setup.

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
} from "@company/pw-core";
```

See [src/index.ts](src/index.ts) for the full public API surface.

## CLI

```bash
npx pw-core validate-test-cases <file> [--schemas-dir <dir>]
```

Validates a test-cases JSON file against the bundled schemas.

## Publishing to Gitea npm registry

```bash
# 1. Configure registry (one-time, per machine)
npm config set @company:registry https://<GITEA_HOST>/api/packages/<OWNER>/npm/
npm config set -- '//<GITEA_HOST>/api/packages/<OWNER>/npm/:_authToken' "<YOUR_TOKEN>"

# 2. Publish
npm publish
```

## License

[MIT](LICENSE)
