import { describe, it, expect } from 'vitest'
import { fillPlaceholders, foldText } from '../i18n.js'

describe('fillPlaceholders', () => {
  it('substitutes the values it is given', () => {
    expect(
      fillPlaceholders('"{header}" moved from {field}.', { header: 'EPOSTA', field: 'E-posta' }),
    ).toBe('"EPOSTA" moved from E-posta.')
  })

  it('drops a placeholder it has no value for', () => {
    expect(fillPlaceholders('{a} and {b}', { a: 'x' })).toBe('x and ')
    expect(fillPlaceholders('{a}', { a: null })).toBe('')
  })

  it('leaves already-interpolated text alone', () => {
    // The host's own i18n may have substituted before this ever runs.
    expect(fillPlaceholders('"EPOSTA" moved from E-posta.', { header: 'X' })).toBe(
      '"EPOSTA" moved from E-posta.',
    )
  })
})

describe('foldText', () => {
  it('folds Turkish letters onto their ASCII neighbours', () => {
    expect(foldText('İş Deneyimi')).toBe('is deneyimi')
    expect(foldText('Eğitim')).toBe('egitim')
    expect(foldText('FİRMA ADI 3')).toBe('firma adi 3')
    expect(foldText('Şirket Kodu')).toBe('sirket kodu')
    expect(foldText('Çalışan Sayısı')).toBe('calisan sayisi')
  })

  it('leaves plain ASCII as lowercase', () => {
    expect(foldText('Norm Count')).toBe('norm count')
  })
})
