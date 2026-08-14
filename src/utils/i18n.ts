/**
 * Small text helpers for the translated UI.
 *
 * The package's {@link useTranslate} adapter returns `params.default` verbatim
 * when the host has no entry for a key (and the default adapter always does), so
 * a fallback string carrying `{placeholders}` would reach the screen with its
 * braces intact. {@link fillPlaceholders} closes that gap without assuming
 * anything about the host's i18n library — it is a no-op on text the host has
 * already interpolated.
 */

/**
 * Substitute `{name}` placeholders in a translated string.
 *
 * @param text   The translated (or fallback) text
 * @param params Values to substitute; a missing key renders as an empty string
 * @return The text with every known placeholder replaced
 */
export function fillPlaceholders(text: string, params: Record<string, unknown> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key] ?? '') : '',
  )
}

/**
 * Fold a string for searching: lowercase, and strip diacritics.
 *
 * Unlike the byte-wise normalisation the column matcher needs (see
 * `normalizeHeader`), this is for humans typing into a search box: `"is
 * deneyimi"` has to find `"İş Deneyimi"`, and `"egitim"` has to find `"Eğitim"`.
 * Turkish dotted/dotless I is mapped explicitly, because `toLowerCase()` turns
 * `İ` into `i̇` (an `i` plus a combining dot) which NFD alone would not fold.
 *
 * @param value Raw text
 * @return The folded form, safe to compare with `includes()`
 */
export function foldText(value: string): string {
  return value
    .replace(/[İI]/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
