import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { SupportedLanguage } from "../constants/languages";
import { createLogger } from "../logger/logger";

const log = createLogger("i18n");

/**
 * I18n provider that loads strings from `{stringsDir}/{lang}.json`.
 * Provides both the new API (t, strings) expected by fixtures and
 * the legacy API (get, has) for backwards compatibility.
 */
export type I18n = {
  lang: SupportedLanguage;
  otherLang: SupportedLanguage;
  // New API - expected by test.ts fixtures
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Fetches a string from the OTHER locale's file (useful for language switch tests) */
  other: (key: string, vars?: Record<string, string | number>) => string;
  strings: Record<string, string>;
  // Legacy API - kept for backwards compatibility
  get: (scope: string, key: string) => string;
  has: (scope: string, key: string) => boolean;
};

/**
 * Options for creating an i18n provider.
 */
export type I18nProviderOptions = {
  /** Absolute path to the directory containing `{lang}.json` string files. */
  stringsDir: string;
};

// Recursive schema for i18n strings: nested objects with string leaf values
type StringsData = Record<string, unknown>;
const StringsDataSchema: z.ZodType<StringsData> = z.lazy(() =>
  z.record(z.string(), z.union([z.string(), StringsDataSchema])),
);

/**
 * Loads and validates a JSON i18n strings file.
 * If file doesn't exist, returns empty object (missing translations).
 * If file exists but is invalid, throws with clear error message.
 */
function loadAndValidateStrings(filePath: string): StringsData {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    throw new Error(
      `[i18n] Failed to read strings file at "${filePath}": ${(e as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (e) {
    throw new Error(
      `[i18n] Invalid JSON in strings file at "${filePath}": ${(e as Error).message}`,
    );
  }

  const result = StringsDataSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue: z.ZodIssue) => {
        const issuePath =
          issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
        return `  - strings${issuePath}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(
      `[i18n] Invalid strings file at "${filePath}":\n${errors}\n` +
        `Expected: nested object with string values`,
    );
  }

  return result.data;
}

/**
 * Traverses an object using dot-notation key path.
 * e.g., getValue(obj, "login.title") returns obj.login.title
 */
function getValue(obj: StringsData, keyPath: string): unknown {
  const keys = keyPath.split(".");
  let current: unknown = obj;

  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Flattens a nested object into dot-notation keys.
 * e.g., { login: { title: "Hello" } } => { "login.title": "Hello" }
 */
function flattenStrings(
  obj: StringsData,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenStrings(value as StringsData, fullKey));
    } else if (typeof value === "string") {
      result[fullKey] = value;
    } else if (value !== null && value !== undefined) {
      result[fullKey] = String(value);
    }
  }

  return result;
}

/**
 * Interpolates variables into a string template.
 * e.g., interpolate("Hello {name}", { name: "World" }) => "Hello World"
 */
function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in vars ? String(vars[key]) : `{${key}}`;
  });
}

/**
 * Creates an i18n provider instance for the given language.
 * Loads strings from `{stringsDir}/{lang}.json`.
 * Also loads the other locale's strings for cross-locale assertions.
 *
 * @param lang - The target language
 * @param options - Must include `stringsDir` (absolute path to strings directory)
 */
export function createI18nProvider(
  lang: SupportedLanguage,
  options: I18nProviderOptions,
): I18n {
  const { stringsDir } = options;
  const stringsData = loadAndValidateStrings(
    path.join(stringsDir, `${lang}.json`),
  );
  const flatStrings = flattenStrings(stringsData);

  // Load the other locale's strings for cross-locale assertions (e.g., language switch tests)
  const otherLang: SupportedLanguage = lang === "en" ? "ar" : "en";
  const otherStringsData = loadAndValidateStrings(
    path.join(stringsDir, `${otherLang}.json`),
  );
  const otherFlatStrings = flattenStrings(otherStringsData);

  return {
    lang,
    otherLang,

    /**
     * Gets a translated string by key with optional variable interpolation.
     * Supports dot-notation keys (e.g., "login.title").
     */
    t(key: string, vars?: Record<string, string | number>): string {
      const value = flatStrings[key];
      if (value !== undefined) {
        return interpolate(value, vars);
      }

      // Try nested lookup as fallback
      const nested = getValue(stringsData, key);
      if (typeof nested === "string") {
        return interpolate(nested, vars);
      }

      log.warn(`Missing key: ${key} for lang=${lang}`);
      return key; // Return key as fallback instead of empty string
    },

    /**
     * Gets a string from the OTHER locale's file.
     * Useful for language switch tests where you need to verify
     * the UI shows strings from a different locale after switching.
     */
    other(key: string, vars?: Record<string, string | number>): string {
      const value = otherFlatStrings[key];
      if (value !== undefined) {
        return interpolate(value, vars);
      }

      // Try nested lookup as fallback
      const nested = getValue(otherStringsData, key);
      if (typeof nested === "string") {
        return interpolate(nested, vars);
      }

      log.warn(`Missing key: ${key} for otherLang=${otherLang}`);
      return key;
    },

    /**
     * Raw flattened strings object for direct access.
     */
    strings: flatStrings,

    /**
     * Legacy API: Checks if a string exists by scope and key.
     * @deprecated Use t() with dot-notation instead (e.g., t("scope.key"))
     */
    has(scope: string, key: string): boolean {
      const fullKey = `${scope}.${key}`;
      return (
        fullKey in flatStrings || getValue(stringsData, fullKey) !== undefined
      );
    },

    /**
     * Legacy API: Gets a string by scope and key.
     * @deprecated Use t() with dot-notation instead (e.g., t("scope.key"))
     */
    get(scope: string, key: string): string {
      return this.t(`${scope}.${key}`);
    },
  };
}
