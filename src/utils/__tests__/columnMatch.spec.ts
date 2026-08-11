import { describe, it, expect } from 'vitest'
import { normalizeHeader, fuzzyScore, scoreColumnMatch } from '../columnMatch'

describe('normalizeHeader', () => {
  it('collapses whitespace and dashes into underscores', () => {
    expect(normalizeHeader('E-Posta Adresi')).toBe('e_posta_adresi')
    expect(normalizeHeader('start date')).toBe('start_date')
  })

  it('lowercases ASCII only, as PHP strtolower does', () => {
    // The İ and Ş are multi-byte, so PHP leaves them uppercase.
    expect(normalizeHeader('FİRMA ADI')).toBe('fİrma_adi')
    expect(normalizeHeader('Şirket Adı')).toBe('Şirket_adı')
  })

  it('keeps surrounding whitespace as underscores, because trim runs after the replace', () => {
    expect(normalizeHeader('  Ad  Soyad  ')).toBe('_ad_soyad_')
  })
})

describe('fuzzyScore', () => {
  // Expected values produced by the backend itself:
  //   docker exec -u sail ono-backend php -r '...ColumnMatcherService::fuzzyScore...'
  // over the normalised pairs. Any drift here means the port diverged.
  const parity: Array<[string, string, number]> = [
    ['e_posta_adresi', 'email', 0.183],
    ['e_posta', 'email', 0.19],
    ['ad_soyad', 'name', 0.067],
    ['fİrma_adi', 'company_name', 0.212],
    ['Şirket_adı', 'company_name', 0.067],
    ['notlar', 'email', 0.073],
    ['sicil_no', 'personnel_number', 0.233],
    ['yönetici_sicil_no', 'manager_personnel_number', 0.179],
    ['departman', 'department_name', 0.48],
    ['_ad_soyad_', 'name', 0.097],
    ['telefon', 'phone', 0.19],
    ['gsm', 'phone', 0.0],
  ]

  it.each(parity)('scores %s against %s as %f, matching PHP', (a, b, expected) => {
    expect(fuzzyScore(a, b)).toBeCloseTo(expected, 3)
  })

  it('caps identical strings at the fuzzy ceiling', () => {
    // Reached only via label/alias comparison; an identical key short-circuits
    // to the exact tier before fuzzy scoring runs.
    expect(fuzzyScore('start_date', 'start_date')).toBe(0.89)
  })

  it('scores empty input as zero', () => {
    expect(fuzzyScore('', 'email')).toBe(0)
    expect(fuzzyScore('email', '')).toBe(0)
  })
})

describe('scoreColumnMatch', () => {
  it('awards 1.0 for an exact key match, ignoring case and separators', () => {
    expect(scoreColumnMatch('start date', 'start_date')).toEqual({ score: 1, tier: 'exact' })
    expect(scoreColumnMatch('EMAIL', 'email')).toEqual({ score: 1, tier: 'exact' })
  })

  it('awards 0.95 for a label match', () => {
    expect(scoreColumnMatch('E-posta', 'email', { label: 'E-posta' })).toEqual({
      score: 0.95,
      tier: 'label',
    })
  })

  it('awards 0.9 for an alias match', () => {
    expect(
      scoreColumnMatch('GSM', 'phone', { label: 'Telefon', aliases: ['gsm', 'cep telefonu'] }),
    ).toEqual({ score: 0.9, tier: 'alias' })
  })

  it('prefers the key, label or alias that fuzzy-matches best', () => {
    const withoutLabel = scoreColumnMatch('Departman Adı', 'department_name')
    const withLabel = scoreColumnMatch('Departman Adı', 'department_name', {
      label: 'Departman',
    })

    expect(withLabel.tier).toBe('fuzzy')
    expect(withLabel.score).toBeGreaterThan(withoutLabel.score)
  })

  it('reports a weak score rather than flattening it to zero', () => {
    // The backend zeroes anything under its 0.3 suggestion threshold when
    // auto-matching; a deliberate user pick keeps its real score instead.
    const { score, tier } = scoreColumnMatch('Notlar', 'email', { label: 'E-posta' })

    expect(tier).toBe('fuzzy')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(0.3)
  })
})
