/**
 * Client-side port of the backend column matcher
 * (`Umutcangungormus\LaravelImportExport\Services\ColumnMatcherService`).
 *
 * The backend scores every file header against every importable field once, at
 * upload time, and the session's mappings carry those numbers. As soon as the
 * user re-points a target field at a different column, that stored score no
 * longer describes what is on screen — so the mapping modal needs to score the
 * new pair itself, without a round trip.
 *
 * Parity with PHP is deliberate and load-bearing: the modal shows the backend's
 * own number for pairs the backend already scored and falls back to this port
 * only for user edits, so the two must agree or the percentage would visibly
 * jump when a user re-selects the column that was there to begin with. The
 * quirks below are therefore faithful, not accidental:
 *
 *  - `strlen()`/`levenshtein()` count **bytes**, so all string work happens on
 *    UTF-8 byte arrays. `Şirket_adı` is 12 bytes, not 10 characters.
 *  - `strtolower()` is byte-wise, i.e. ASCII-only: `FİRMA ADI` normalises to
 *    `fİrma_adi` with the İ left alone. `String.toLowerCase()` would not.
 *  - `normalize()` replaces whitespace *before* trimming, so surrounding
 *    spaces survive as underscores: `"  Ad  Soyad  "` → `_ad_soyad_`.
 */

/** Score awarded when the normalised header equals the field key. */
const SCORE_EXACT = 1.0
/** Score awarded when the normalised header equals the field's label. */
const SCORE_LABEL = 0.95
/** Score awarded when the normalised header equals one of the field's aliases. */
const SCORE_ALIAS = 0.9
/** Ceiling for fuzzy matches, keeping them below the exact-match tiers. */
const FUZZY_CEILING = 0.89

const encoder = new TextEncoder()

/**
 * Lowercase the ASCII letters of a string, leaving every other byte alone.
 *
 * Mirrors PHP's byte-wise `strtolower()`, which does not touch multi-byte
 * characters such as `İ` or `Ş`.
 *
 * @param value Raw string
 * @return The string with `A-Z` lowercased
 */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32))
}

/**
 * Normalise a header or field name for comparison.
 *
 * Port of `ColumnMatcherService::normalize()`: collapse whitespace and dashes
 * into single underscores, trim, then ASCII-lowercase. The order matters —
 * leading and trailing whitespace has already become an underscore by the time
 * `trim()` runs, so it survives.
 *
 * @param value Raw header or field name
 * @return The normalised form used by every comparison in this module
 */
export function normalizeHeader(value: string): string {
  return asciiLower(value.replace(/[\s\-]+/g, '_').trim())
}

/**
 * Round to three decimals the way PHP's `round()` does.
 *
 * Guards against binary-float representations that sit a hair below the
 * halfway point and would otherwise round down where PHP rounds up.
 *
 * @param value Number to round
 * @return The value rounded to three decimal places
 */
function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

/**
 * Levenshtein distance between two byte sequences.
 *
 * Matches PHP's `levenshtein()` with its default cost of 1 per insertion,
 * replacement and deletion, and its byte-level view of the strings.
 *
 * @param a First byte sequence
 * @param b Second byte sequence
 * @return Edit distance in bytes
 */
function levenshtein(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j++) previous[j] = j

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1)
    }
    const swap = previous
    previous = current
    current = swap
  }

  return previous[b.length]
}

/**
 * Longest common run of bytes shared by two sequences.
 *
 * Port of PHP's internal `php_similar_str()`. Returns the run's length and
 * where it starts in each sequence, which the recursion below needs to walk
 * outwards from the match.
 *
 * @param a      First byte sequence
 * @param b      Second byte sequence
 * @return The run length plus its offset in each sequence
 */
function longestCommonRun(
  a: Uint8Array,
  b: Uint8Array,
): { max: number; pos1: number; pos2: number } {
  let max = 0
  let pos1 = 0
  let pos2 = 0

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let length = 0
      while (i + length < a.length && j + length < b.length && a[i + length] === b[j + length]) {
        length++
      }
      if (length > max) {
        max = length
        pos1 = i
        pos2 = j
      }
    }
  }

  return { max, pos1, pos2 }
}

/**
 * Count the bytes two sequences have in common, PHP's way.
 *
 * Port of `php_similar_char()`: take the longest shared run, then recurse into
 * the segments on either side of it.
 *
 * @param a First byte sequence
 * @param b Second byte sequence
 * @return Number of matching bytes
 */
function similarChars(a: Uint8Array, b: Uint8Array): number {
  const { max, pos1, pos2 } = longestCommonRun(a, b)
  if (max === 0) return 0

  let sum = max

  if (pos1 > 0 && pos2 > 0) {
    sum += similarChars(a.subarray(0, pos1), b.subarray(0, pos2))
  }

  if (pos1 + max < a.length && pos2 + max < b.length) {
    sum += similarChars(a.subarray(pos1 + max), b.subarray(pos2 + max))
  }

  return sum
}

/**
 * Similarity of two byte sequences as a 0–1 ratio.
 *
 * Equivalent to PHP's `similar_text($a, $b, $percent)` divided by 100.
 *
 * @param a First byte sequence
 * @param b Second byte sequence
 * @return Ratio of matching bytes to total length
 */
function similarRatio(a: Uint8Array, b: Uint8Array): number {
  const total = a.length + b.length
  if (total === 0) return 0

  return (similarChars(a, b) * 2) / total
}

/**
 * Jaccard overlap of the underscore-separated words of two normalised strings.
 *
 * Mirrors PHP's `array_intersect()`/`array_unique()` pairing, which keeps
 * duplicates on the left-hand side of the intersection but not in the union.
 *
 * @param a First normalised string
 * @param b Second normalised string
 * @return Overlap ratio between 0 and 1
 */
function wordOverlap(a: string, b: string): number {
  const wordsA = a.split(/[\s_\-]+/)
  const wordsB = b.split(/[\s_\-]+/)
  const setB = new Set(wordsB)

  const intersection = wordsA.filter((word) => setB.has(word)).length
  const union = new Set([...wordsA, ...wordsB]).size

  return union > 0 ? intersection / union : 0
}

/**
 * Fuzzy similarity of two already-normalised strings.
 *
 * Port of `ColumnMatcherService::fuzzyScore()`: a weighted blend of edit
 * distance, byte similarity and word overlap, capped so a fuzzy hit can never
 * outrank an exact key, label or alias match.
 *
 * @param a First normalised string
 * @param b Second normalised string
 * @return A score between 0 and 0.89
 */
export function fuzzyScore(a: string, b: string): number {
  if (a === '' || b === '') return 0

  const bytesA = encoder.encode(a)
  const bytesB = encoder.encode(b)

  const maxLength = Math.max(bytesA.length, bytesB.length)
  const levenshteinScore = 1 - levenshtein(bytesA, bytesB) / maxLength
  const similarScore = similarRatio(bytesA, bytesB)
  const overlapScore = wordOverlap(a, b)

  const combined = levenshteinScore * 0.4 + similarScore * 0.4 + overlapScore * 0.2

  return Math.min(round3(combined), FUZZY_CEILING)
}

/** What the header was matched on, mirroring the backend's `match_method`. */
export type ColumnMatchTier = 'exact' | 'label' | 'alias' | 'fuzzy'

/** A field's comparable names, as far as the client knows them. */
export interface ColumnMatchTarget {
  /** Human label for the field, e.g. `Ad Soyad`. */
  label?: string
  /** Alternative header spellings the backend accepts for this field. */
  aliases?: string[]
}

/**
 * Score one file header against one target field.
 *
 * Port of `ColumnMatcherService::scoreWithMethod()`. The backend's suggestion
 * threshold is deliberately *not* applied: a header the user picked by hand is
 * shown with whatever score it earns rather than being flattened to zero.
 *
 * @param header    Raw file header, e.g. `E-Posta Adresi`
 * @param fieldKey  Target field key, e.g. `email`
 * @param target    The field's label and aliases, when the caller knows them
 * @return The score (0–1) and which tier produced it
 */
export function scoreColumnMatch(
  header: string,
  fieldKey: string,
  target: ColumnMatchTarget = {},
): { score: number; tier: ColumnMatchTier } {
  const normalizedHeader = normalizeHeader(header)
  const normalizedKey = normalizeHeader(fieldKey)

  if (normalizedHeader === normalizedKey) {
    return { score: SCORE_EXACT, tier: 'exact' }
  }

  const normalizedLabel = normalizeHeader(target.label ?? '')
  if (normalizedLabel !== '' && normalizedHeader === normalizedLabel) {
    return { score: SCORE_LABEL, tier: 'label' }
  }

  const normalizedAliases = (target.aliases ?? []).map(normalizeHeader)
  if (normalizedAliases.includes(normalizedHeader)) {
    return { score: SCORE_ALIAS, tier: 'alias' }
  }

  let score = fuzzyScore(normalizedHeader, normalizedKey)

  if (normalizedLabel !== '') {
    score = Math.max(score, fuzzyScore(normalizedHeader, normalizedLabel))
  }

  for (const alias of normalizedAliases) {
    score = Math.max(score, fuzzyScore(normalizedHeader, alias))
  }

  return { score, tier: 'fuzzy' }
}
