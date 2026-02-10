import { test as base, type Page, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { SupportedLanguage } from "../constants/languages";
import { createI18nProvider, type I18n } from "../i18n/i18nProvider";
import { switchLanguageIfNeeded, resolveLangFromEnv } from "../i18n/ui";
import { loadFeatures, type FeaturesApi } from "../features/features";
import { ENV, pickCred } from "../env/env";
import { createLogger } from "../logger/logger";

const log = createLogger("fixtures");

// ─── Public types ───────────────────────────────────────────────────────────

type Lang = SupportedLanguage;

export type I18nApi = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Fetches a string from the OTHER locale's file (useful for language switch tests) */
  other: (key: string, vars?: Record<string, string | number>) => string;
  strings: Record<string, string>;
};

export type TestFeaturesApi = {
  isEnabled: (key: string) => boolean;
  require: (key: string, reason?: string) => void;
};

export type CoreTestFixtures = {
  lang: Lang;
  i18n: I18nApi;
  autoSwitchLanguage: () => Promise<void>;
  features: TestFeaturesApi;
};

export type CoreWorkerFixtures = {
  workerStorageState: string;
  accountIndex: number;
  workerFeatures: FeaturesApi;
};

/**
 * Authenticate callback signature.
 * The client provides an app-specific implementation (login flow).
 */
export type AuthenticateFn = (
  browser: Browser,
  lang: Lang,
  username: string,
  password: string,
  baseURL: string,
) => Promise<string>;

/**
 * Configuration for createTestFixtures().
 */
export type CreateTestFixturesConfig = {
  /** Absolute path to the directory containing `{lang}.json` string files. */
  stringsDir: string;
  /**
   * App-specific authentication function.
   * Receives browser, lang, credentials, and baseURL.
   * Must return the absolute path to the saved storageState JSON file.
   */
  authenticate: AuthenticateFn;
  /** Optional override for feature flags config directory. */
  configDir?: string;
  /**
   * Optional init script injected into every browser context before authentication.
   * Typically sets localStorage language preference.
   * Receives the lang string as its argument.
   */
  languageInitScript?: (lang: string) => void;
};

// ─── Internal helpers ───────────────────────────────────────────────────────

function langFromProjectName(projectName: string): Lang {
  if (projectName.endsWith("-ar")) return "ar";
  return "en";
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates the Playwright test fixture set used by all tests.
 *
 * Core owns the generic fixtures (lang, i18n, features, auth scaffold).
 * The client injects app-specific behavior via the `authenticate` callback.
 *
 * @example
 * ```ts
 * // tests/fixtures/test.ts (client wrapper)
 * import { createTestFixtures } from "@company/pw-core";
 *
 * export const test = createTestFixtures({
 *   stringsDir: path.resolve(__dirname, "../../test-lib/strings"),
 *   authenticate: async (browser, lang, username, password, baseURL) => {
 *     // app-specific login flow
 *     // return path to saved storageState JSON
 *   },
 * });
 * ```
 */
export function createTestFixtures(config: CreateTestFixturesConfig) {
  const { stringsDir, authenticate, configDir, languageInitScript } = config;

  return base.extend<CoreTestFixtures, CoreWorkerFixtures>({
    /**
     * Worker-scoped auth storage state path (created once per parallel worker).
     * Follows Playwright's "Moderate: one account per parallel worker" approach.
     */
    workerStorageState: [
      async ({ browser }, use, workerInfo) => {
        const lang = langFromProjectName(workerInfo.project.name);
        const id = workerInfo.parallelIndex;
        const { username, password } = pickCred(id);

        const authBaseDir =
          ENV.AUTH_DIR ??
          path.resolve(workerInfo.project.outputDir, ".auth");

        fs.mkdirSync(authBaseDir, { recursive: true });

        const filePath = path.join(
          authBaseDir,
          `default.${lang}.${id}.json`,
        );

        // Reuse if it exists
        if (fs.existsSync(filePath)) {
          await use(filePath);
          return;
        }

        // Determine baseURL from project config
        const baseURL = workerInfo.project.use?.baseURL ?? "";

        // If client provides a languageInitScript, create a context with it
        if (languageInitScript) {
          const context = await browser.newContext({
            storageState: undefined,
            baseURL,
          });
          await context.addInitScript(languageInitScript, lang);
          await context.close();
        }

        // Delegate to client-provided authenticate function
        const statePath = await authenticate(
          browser,
          lang,
          username,
          password,
          baseURL,
        );

        // If authenticate returns a different path, copy to our canonical path
        if (statePath !== filePath) {
          fs.copyFileSync(statePath, filePath);
        }

        await use(filePath);
      },
      { scope: "worker" },
    ],

    /**
     * Override built-in storageState fixture so that ALL contexts/pages
     * automatically start with the correct worker-auth state.
     */
    storageState: ({ workerStorageState }, use) => use(workerStorageState),

    /**
     * Expose accountIndex (parallel worker slot) for debugging / data partitioning.
     */
    accountIndex: [
      async ({}, use, workerInfo) => {
        await use(workerInfo.parallelIndex);
      },
      { scope: "worker" },
    ],

    /**
     * Worker-scoped feature flags: loads config once per worker.
     */
    workerFeatures: [
      async ({}, use, workerInfo) => {
        const features = loadFeatures({
          rootDir: workerInfo.config.rootDir,
          envName: ENV.TEST_ENV,
          configDir,
        });
        await use(features);
      },
      { scope: "worker" },
    ],

    /**
     * Language derived from env override or project name.
     */
    lang: async ({}, use, testInfo) => {
      const byEnv = resolveLangFromEnv(ENV.LANG);
      const byProject = langFromProjectName(testInfo.project.name);
      await use(byEnv ?? byProject);
    },

    /**
     * i18n provider, per test.
     */
    i18n: async ({ lang }, use) => {
      const provider: I18n = createI18nProvider(lang, { stringsDir });
      await use({
        t: provider.t,
        other: provider.other,
        strings: provider.strings,
      });
    },

    /**
     * Auto-switch language helper for tests that need to enforce language mid-flow.
     */
    autoSwitchLanguage: async ({ page, lang }, use) => {
      await use(async () => {
        log.debug("autoSwitchLanguage fixture called");
        log.debug("Target lang from fixture:", lang);
        log.debug("Current page URL:", page.url());
        await switchLanguageIfNeeded(page, lang, stringsDir);
        log.debug("switchLanguageIfNeeded completed");
      });
    },

    /**
     * Feature flags: test-scoped because require() uses testInfo.skip().
     */
    features: async ({ workerFeatures }, use, testInfo) => {
      await use({
        isEnabled: (key) => workerFeatures.isEnabled(key),
        require: (key, reason) => {
          if (!workerFeatures.isEnabled(key)) {
            testInfo.skip(
              true,
              reason ?? `Feature '${key}' disabled by config`,
            );
          }
        },
      });
    },
  });
}