/**
 * @company/pw-core — Public API
 *
 * All consumer imports MUST come through this barrel.
 * No deep imports into internal modules.
 */

// --- Environment ---
export { ENV, clientId, pickCred } from "./env/env";
export type { UserCred } from "./env/env";

// --- Constants ---
export { TAGS, withTags } from "./constants/tags";
export type { Tag } from "./constants/tags";
export { supportedLanguages } from "./constants/languages";
export type { SupportedLanguage } from "./constants/languages";

// --- Logger ---
export { logger, createLogger, getEffectiveLogLevel, isColoredOutput } from "./logger/logger";
export type { LogLevel, Logger } from "./logger/logger";

// --- i18n ---
export { createI18nProvider, switchLanguageIfNeeded, resolveLangFromEnv, createTextLocator } from "./i18n";
export type { I18n, I18nProviderOptions } from "./i18n";

// --- Features ---
export { loadFeatures } from "./features";
export type { FeaturesApi, LoadFeaturesOptions } from "./features";
