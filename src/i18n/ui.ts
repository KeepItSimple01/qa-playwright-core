import { expect, Locator, Page } from "@playwright/test";
import type { SupportedLanguage } from "../constants/languages";
import type { I18n } from "./i18nProvider";
import { ENV } from "../env/env";
import { createI18nProvider } from "./i18nProvider";
import { createLogger } from "../logger/logger";

const log = createLogger("i18n.ui");

/**
 * Gets the opposite language for switching purposes.
 */
function getOtherLang(lang: SupportedLanguage): SupportedLanguage {
  return lang === "en" ? "ar" : "en";
}

/**
 * Switches the UI language if needed.
 *
 * This function checks if the language toggle for the TARGET language is visible.
 * If visible, it means we're NOT in that language yet, so we click to switch.
 * If not visible, we're likely already in the target language.
 *
 * The toggle label is resolved from i18n strings to ensure consistency with
 * whatever the application actually displays.
 *
 * @param page - Playwright page instance
 * @param targetLang - The language we want to switch TO ("en" | "ar")
 * @param stringsDir - Absolute path to the directory containing string JSON files
 */
export async function switchLanguageIfNeeded(
  page: Page,
  targetLang: SupportedLanguage,
  stringsDir: string,
): Promise<void> {
  // Resolve the toggle labels from i18n for each language
  // When in English, the toggle shows the Arabic label (to switch TO Arabic)
  // When in Arabic, the toggle shows the English label (to switch TO English)
  log.debug("=== START ===");
  log.debug("Target language:", targetLang);
  log.debug("Current URL:", page.url());

  const otherLang = getOtherLang(targetLang);
  const otherI18n = createI18nProvider(otherLang, { stringsDir });

  // The label we need to click is what's shown when we're in the OTHER language
  // (because that's the toggle TO our target language)
  const toggleLabelToClick = otherI18n.t("login.languageToggleLabel");

  // After clicking, we'll be in target language, so the toggle will show
  // the label to switch BACK to the other language
  const targetI18n = createI18nProvider(targetLang, { stringsDir });
  const toggleLabelAfterSwitch = targetI18n.t("login.languageToggleLabel");

  log.debug("Toggle label to click:", toggleLabelToClick);
  log.debug("Toggle label after switch:", toggleLabelAfterSwitch);

  // 1) Wait for DOM to be ready before interacting with toggles
  await page.waitForLoadState("domcontentloaded");

  // Helper: locate toggle as link OR button by accessible name
  const toggleToClick = page
    .getByRole("link", { name: toggleLabelToClick })
    .or(page.getByRole("button", { name: toggleLabelToClick }));

  const oppositeToggle = page
    .getByRole("link", { name: toggleLabelAfterSwitch })
    .or(page.getByRole("button", { name: toggleLabelAfterSwitch }));

  // 2) If we're already in target language, opposite toggle should be visible.
  // Use a SHORT wait to avoid slowing tests.
  try {
    await oppositeToggle.waitFor({ state: "visible", timeout: 3_000 });
    log.debug("Already in target language:", targetLang);
    log.debug("=== END ===");
    return;
  } catch {
    // Not visible yet => we might need to switch, or toggle hasn't rendered yet.
  }

  // 3) Wait briefly for the toggle-to-click to appear, then click.
  try {
    await toggleToClick.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    // At this point neither toggle was visible quickly.
    // This is a real signal something is off (selector, timing, UI variant).
    // Capture a helpful error.
    const msg =
      `[switchLanguageIfNeeded] Could not find language toggle.\n` +
      `Expected either:\n` +
      `- "${toggleLabelToClick}" (to switch)\n` +
      `- "${toggleLabelAfterSwitch}" (already switched)\n` +
      `URL: ${page.url()}`;
    throw new Error(msg);
  }

  log.debug("Clicking toggle to switch language...");
  await toggleToClick.click();

  // 4) Confirm switch completed by waiting for the opposite toggle
  await expect(oppositeToggle).toBeVisible({ timeout: 10_000 });
  log.debug("Switch confirmed - opposite toggle visible");
  log.debug("=== END ===");
}

/**
 * Resolves the UI language from an optional raw string or ENV.LANG.
 * Returns undefined if no valid language can be determined.
 *
 * @param raw - Optional raw language string (defaults to ENV.LANG)
 * @returns SupportedLanguage or undefined
 */
export function resolveLangFromEnv(
  raw?: string,
): SupportedLanguage | undefined {
  const value = raw ?? ENV.LANG;
  if (!value) return undefined;

  return value.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/**
 * Creates a locator that matches text from i18n, escaping special regex characters.
 * The locator matches elements containing the i18n text with optional leading/trailing whitespace.
 * Useful for creating text-based locators that work across different languages.
 *
 * @param page - The Playwright page instance
 * @param i18n - The i18n provider instance
 * @param scope - The i18n scope (e.g., "profileMenu")
 * @param key - The i18n key, supports nested keys with dot notation (e.g., "options.changePin")
 * @param selector - Optional CSS selector to filter by (defaults to "div")
 * @returns A locator that matches elements containing the i18n text (with optional whitespace)
 */
export function createTextLocator(
  page: Page,
  i18n: I18n,
  scope: string,
  key: string,
  selector: string = "div",
): Locator {
  const text = i18n.get(scope, key);
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Allow optional whitespace around the text
  return page
    .locator(selector)
    .filter({ hasText: new RegExp(`^\\s*${escapedText}\\s*$`) });
}
