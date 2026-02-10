/**
 * Centralized Playwright test tags.
 *
 * USAGE RULES:
 * - Only use tags from TAGS; do not inline '@smoke' strings directly in tests.
 * - Tier tags drive Jenkins suites (see .jenkins/Jenkinsfile for grep patterns).
 * - Use withTags() helper to apply tags to test() or test.describe() calls.
 *
 * @example
 * import { TAGS, withTags } from '@company/pw-core';
 * test('Login works', withTags(TAGS.smoke, TAGS.auth), async ({ page }) => {});
 */
export const TAGS = {
  // Tier / execution tags (drive Jenkins suites)
  smoke: "@smoke", // Fast critical path tests (PR builds)
  critical: "@critical", // Must-pass tests (PR builds)
  api: "@api", // API-level tests (main builds)
  contract: "@contract", // Contract/integration tests (main builds)
  nightly: "@nightly", // Comprehensive tests (nightly builds)
  manualCandidate: "@manual-candidate", // Excluded from nightly automation

  // Optional domain tags (organization / targeted runs)
  auth: "@auth",
  rtl: "@rtl",
  visual: "@visual", // Visual regression tests (screenshot comparisons)
} as const;

export type Tag = (typeof TAGS)[keyof typeof TAGS];

/**
 * Helper: returns the exact shape Playwright expects for tagging.
 * (Playwright supports tag as string or string[].)
 * @example
 * import { test } from '@playwright/test';
 * import { TAGS, withTags } from '@company/pw-core';
 * test.describe('Authentication', withTags(TAGS.auth), () => {
 *  test('Login works', withTags(TAGS.smoke, TAGS.auth), async ({ page }) => {});
 * });
 */
export function withTags(...tags: Tag[]) {
  return { tag: tags.length === 1 ? tags[0] : tags };
}
