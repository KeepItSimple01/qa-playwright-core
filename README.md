# @keepitsimple01/pw-core

Core Playwright testing infrastructure — fixtures, i18n, feature flags, environment validation, logging, test tagging, and test-case validation.

## Overview

Playwright test suites across projects tend to re-implement the same scaffolding: pooling auth storage state across parallel workers, loading credentials from environment variables, managing i18n string files, resolving feature flags per environment, and categorizing tests for CI filtering. This package extracts that infrastructure into a versioned, installable dependency.

The package ships no test specs, page objects, or app-specific string files. It provides the fixture factory, utilities, and TypeScript types that a consuming test project builds on top of.

This package is the public half of a two-part system. A private companion template consumes it and supplies the app-specific `authenticate()` callback, i18n string files, feature flag configs, page objects, and test specs — enabling an AI-assisted test generation workflow. The split keeps the reusable core versioned and auditable independently of any specific application under test.

## Installation

In your `package.json` dependencies:

```json
"@keepitsimple01/pw-core": "github:KeepItSimple01/qa-playwright-core"
```

Pin to a specific release tag:

```json
"@keepitsimple01/pw-core": "github:KeepItSimple01/qa-playwright-core#v0.1.0"
```

Then run `npm install`. No npm registry or auth tokens required.

**Peer dependency:** `@playwright/test >= 1.50.0`

## Architecture

```text
@keepitsimple01/pw-core  (this repo — public, versioned)
│
│  Provides:
│    createTestFixtures()   fixture factory
│    ENV, pickCred()        validated env & credential pooling
│    createI18nProvider()   string loading & interpolation
│    loadFeatures()         feature flag resolution
│    createLogger()         structured logging
│    TAGS, withTags()       test categorization
│    validateTestCases()    spec validation (CLI + programmatic)
│
└── consumed by ──► companion template  (private)
                       Provides:
                         authenticate()     app-specific login flow
                         {lang}.json        i18n string files
                         features.*.json    feature flag configs
                         playwright.config  project setup
                         page objects       app UI abstractions
                         test specs         generated + hand-authored tests
```

The companion template wires the core fixtures into a specific application under test. Version-pinning the core in the template's `package.json` provides an explicit upgrade boundary.

## Usage

The primary integration point is `createTestFixtures`. Call it once in a shared fixtures file and export the result for use across your test suite:

```typescript
// tests/fixtures/test.ts
import {
  createTestFixtures,
  type AuthenticateFn,
} from "@keepitsimple01/pw-core";
import path from "path";

const authenticate: AuthenticateFn = async (
  browser,
  lang,
  username,
  password,
  baseURL,
) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // app-specific login steps
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");

  const storageStatePath = path.join(
    process.env.AUTH_DIR!,
    `worker-${lang}.json`,
  );
  await context.storageState({ path: storageStatePath });
  await context.close();
  return storageStatePath;
};

export const test = createTestFixtures({
  stringsDir: path.resolve(__dirname, "../../test-data/strings"),
  authenticate,
  // configDir: optional override for features config directory
  // languageInitScript: optional fn injected into browser context before auth
});

export { expect } from "@playwright/test";
```

Then in test files:

```typescript
import { test, expect } from "../fixtures/test";
import { TAGS, withTags, withTestCase } from "@keepitsimple01/pw-core";

test(
  "user sees dashboard heading in correct language",
  {
    ...withTags(TAGS.smoke, TAGS.auth),
    ...withTestCase("TC-042"),
  },
  async ({ page, i18n, features }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      i18n.t("dashboard.heading"),
    );

    if (features.isEnabled("new-nav")) {
      // test the new navigation variant
    }
  },
);
```

## API Reference

### Fixtures — `createTestFixtures(config)`

**Config:**

|        Field         |           Type           | Required |                                    Description                                    |
| :------------------: | :----------------------: | :------: | :-------------------------------------------------------------------------------: |
|     `stringsDir`     |         `string`         |   yes    |            Absolute path to directory containing `en.json`, `ar.json`             |
|    `authenticate`    |     `AuthenticateFn`     |   yes    |       App-specific login function; returns path to saved storageState JSON        |
|     `configDir`      |         `string`         |    no    |                 Override directory for feature flag config files                  |
| `languageInitScript` | `(lang: string) => void` |    no    | Script injected into browser context before auth (e.g. set localStorage language) |

**Returns:** Extended Playwright `test` object with the following fixtures:

**Worker-scoped** (created once per parallel worker, shared across tests in that worker):

|       Fixture        |     Type      |                              Description                               |
| :------------------: | :-----------: | :--------------------------------------------------------------------: |
| `workerStorageState` |   `string`    |       Path to auth JSON; reused if it exists, regenerated if not       |
|    `accountIndex`    |   `number`    | `parallelIndex` of the worker — use for data partitioning or debugging |
|   `workerFeatures`   | `FeaturesApi` |         Feature flags loaded once per worker from config files         |

**Test-scoped** (created fresh per test):

|       Fixture        |         Type          |                                     Description                                      |
| :------------------: | :-------------------: | :----------------------------------------------------------------------------------: |
|        `lang`        |    `"en" \| "ar"`     | Resolved from `LANG` env var, then project name suffix (`-ar` → `"ar"`, else `"en"`) |
|        `i18n`        |       `I18nApi`       |             Provides `t(key, vars?)`, `other(key, vars?)`, and `strings`             |
|      `features`      |   `TestFeaturesApi`   |  Provides `isEnabled(key)` and `require(key, reason?)` (skips test if flag is off)   |
| `autoSwitchLanguage` | `() => Promise<void>` |           Switches the UI to the current `lang` via visible toggle element           |

**`AuthenticateFn` signature:**

```typescript
type AuthenticateFn = (
  browser: Browser,
  lang: "en" | "ar",
  username: string,
  password: string,
  baseURL: string,
) => Promise<string>; // returns absolute path to saved storageState JSON
```

***

### Environment — `ENV`, `pickCred`, `clientId`

Validated at module import time using Zod. Throws with a descriptive error if required variables are missing or malformed.

**Required:**

|     Variable     |                     Format                      |             Description              |
| :--------------: | :---------------------------------------------: | :----------------------------------: |
| `E2E_USERS_JSON` | JSON array: `[{"username":"…","password":"…"}]` | Credential pool for parallel workers |

**Optional:**

|        Variable        |                         Description                         |
| :--------------------: | :---------------------------------------------------------: |
|       `TEST_ENV`       |     Environment name passed to feature flag resolution      |
|         `LANG`         |          Override test language (`"en"` or `"ar"`)          |
|       `BASE_URL`       |                        App base URL                         |
|     `BASE_IAM_URL`     |                     IAM / auth base URL                     |
|       `AUTH_DIR`       |         Directory for saved storageState JSON files         |
| `CLIENT_ID` / `TENANT` |  Client identifier used for feature flag client-overrides   |
|      `LOG_LEVEL`       | `"trace"` \| `"debug"` \| `"info"` \| `"warn"` \| `"error"` |
|        `DEBUG`         |             Set to `"1"` to enable debug output             |
|       `NO_COLOR`       |                  Disable ANSI color output                  |
|          `CI`          |          Detected automatically in CI environments          |
|       `DEBUG_UI`       | App-level debug flag (read by core; usage is app-specific)  |

```typescript
import { ENV, pickCred, clientId } from "@keepitsimple01/pw-core";

ENV.TEST_ENV; // string | undefined
ENV.BASE_URL; // string | undefined

const { username, password } = pickCred(workerIndex); // credential by parallel worker index
const id = clientId(); // returns CLIENT_ID ?? TENANT ?? undefined
```

**Extending with app-specific variables:** The core `ENV` object is not extensible. For app-specific env vars, read `process.env` directly in the client repo after dotenv has loaded:

```typescript
// client repo: test-lib/env.ts
import "dotenv/config";
import { ENV } from "@keepitsimple01/pw-core";

export const APP_DEBUG = process.env.MY_APP_DEBUG === "true";
export { ENV }; // re-export core ENV unchanged
```

***

### i18n — `createI18nProvider`, `switchLanguageIfNeeded`, `createTextLocator`

**Supported locales: `"en"` and `"ar"` only.** Language support is hardcoded in three places in the core (`constants/languages.ts`, `fixtures/createTestFixtures.ts`, `i18n/i18nProvider.ts`). Adding a third locale requires a change to this package — it cannot be done from a consuming repo alone.

String files must be JSON objects at `{stringsDir}/{lang}.json`. Nested keys are flattened to dot-notation:

```json
// en.json
{ "dashboard": { "heading": "Welcome" } }
```

```typescript
import { createI18nProvider } from "@keepitsimple01/pw-core";

const i18n = createI18nProvider("en", { stringsDir: "/path/to/strings" });

i18n.t("dashboard.heading"); // "Welcome"
i18n.t("greeting", { name: "Alice" }); // variable interpolation
i18n.other("dashboard.heading"); // returns the "ar" string
```

**`i18n.other(key)` is a binary en↔ar flip, not a generalized "other locale".** It always returns the string for the opposite of the current locale. It exists specifically to support testing language-switch behavior in a two-locale system.

```typescript
// switchLanguageIfNeeded — UI-based toggle switching
import { switchLanguageIfNeeded } from "@keepitsimple01/pw-core";

await switchLanguageIfNeeded(page, "ar", stringsDir);
// Finds the visible language toggle, clicks it, waits for the opposite toggle to appear
```

***

### Feature Flags — `loadFeatures(options)`

```typescript
import { loadFeatures } from "@keepitsimple01/pw-core";

const features = loadFeatures({
  rootDir: "/path/to/project", // config files resolved relative to this
  envName: "staging", // optional; loads features.staging.config.json
  configDir: "/override/path", // optional; overrides default config directory
});

features.isEnabled("new-checkout-flow"); // boolean
```

Config files are JSON objects of `Record<string, boolean>`. Resolution order (later overrides earlier):

1. `{configDir}/features.config.json` (base)
2. `features.{envName}.config.json` (env-specific)
3. `features.{clientId}.config.json` (client-specific)

Default `configDir` is `{rootDir}/test-data/configs`. Missing files are silently skipped.

***

### Logger — `logger`, `createLogger`

```typescript
import { createLogger, logger } from "@keepitsimple01/pw-core";

const log = createLogger("auth"); // prefixes output with [auth]
log.info("Loading storage state");
log.debug("Worker index:", workerIndex);
log.error("Auth failed", error);

logger.warn("Global message with no context prefix");
```

Respects `LOG_LEVEL` env var (`trace` | `debug` | `info` | `warn` | `error`) and standard `NO_COLOR`. ANSI color codes are applied inline — no external dependencies.

***

### Tags & Annotations — `TAGS`, `withTags`, `withTestCase`

```typescript
import { TAGS, withTags, withTestCase } from "@keepitsimple01/pw-core";

test(
  "smoke login",
  {
    ...withTags(TAGS.smoke, TAGS.auth),
    ...withTestCase("TC-001"),
  },
  async ({ page }) => {
    /* … */
  },
);
```

**Available tags:**

|          Tag           |        Value        |
| :--------------------: | :-----------------: |
|      `TAGS.smoke`      |      `@smoke`       |
|    `TAGS.critical`     |     `@critical`     |
|       `TAGS.api`       |       `@api`        |
|    `TAGS.contract`     |     `@contract`     |
|     `TAGS.nightly`     |     `@nightly`      |
| `TAGS.manualCandidate` | `@manual-candidate` |
|      `TAGS.auth`       |       `@auth`       |
|       `TAGS.rtl`       |       `@rtl`        |
|     `TAGS.visual`      |      `@visual`      |

Tags are used with Playwright's `--grep` flag to select test subsets in CI pipelines.

***

### Validation — `validateTestCases`, CLI

Validates test-case spec files against bundled JSON schemas. Schemas enforce required fields (`id`, `title`, `tags`, `tier`, `steps`, `locales`, `automationRisk`, `pages`) and value enums.

**Programmatic:**

```typescript
import { validateTestCases } from "@keepitsimple01/pw-core";

const result = validateTestCases({
  inputFile: "test-data/test-cases.json",
  schemasDir: undefined, // optional; defaults to bundled schemas
});

if (!result.valid) {
  console.error(result.errors);
}
```

**CLI:**

```bash
npx pw-core validate-test-cases test-data/test-cases.json
npx pw-core validate-test-cases test-data/test-cases.json --schemas-dir ./custom-schemas
```

## Development

```bash
npm ci              # install deps from lockfile
npm run build       # compile TypeScript → dist/
npm run typecheck   # type-check without emitting
npm run test        # typecheck + build
npm run clean       # remove dist/
```

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
