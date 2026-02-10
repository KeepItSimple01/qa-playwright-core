/**
 * Test case annotation helpers for Playwright tests.
 *
 * These are generic (string-based) helpers that work without a JSON import.
 * Client repos can narrow the `id` parameter to a union type derived from
 * their own specs/test-cases.json for compile-time validation.
 *
 * @example
 * import { withTestCase } from '@company/pw-core';
 * test('login works', { ...withTags(TAGS.smoke), ...withTestCase('LOGIN-001') }, async () => {});
 *
 * @example
 * import { testCaseAnnotation } from '@company/pw-core';
 * test('login works', {
 *   ...withTags(TAGS.smoke),
 *   annotation: [
 *     testCaseAnnotation('LOGIN-001'),
 *     { type: 'issue', description: 'BUG-123' }
 *   ]
 * }, async () => {});
 */

/**
 * Returns a single annotation object for array composition.
 * Use this when you need multiple annotations on a test.
 */
export function testCaseAnnotation(id: string) {
  return { type: "testcase" as const, description: id };
}

/**
 * Returns the annotation wrapper for single-annotation usage.
 * Spread this alongside withTags() in test options.
 *
 * Note: If you need multiple annotations, use testCaseAnnotation() instead
 * and pass an array to the annotation property.
 */
export function withTestCase(id: string) {
  return { annotation: testCaseAnnotation(id) };
}