import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useColumnMapping } from '../useColumnMapping.js'
import type { APIImportField, APIImportMapping } from '../../types.js'

function makeField(overrides: Partial<APIImportField> = {}): APIImportField {
  return {
    field: 'email',
    label: 'E-posta',
    required: false,
    type: 'string',
    aliases: [],
    group: null,
    group_label: null,
    group_index: null,
    group_field: null,
    ...overrides,
  }
}

function makeMapping(overrides: Partial<APIImportMapping> = {}): APIImportMapping {
  return {
    id: 1,
    source_column: 'EPOSTA',
    target_field: 'email',
    confidence_score: 0.9,
    match_method: 'alias',
    is_required: true,
    is_confirmed: true,
    ...overrides,
  }
}

/** A repeating section: `slots` slots of one leaf each. */
function experienceFields(slots: number): APIImportField[] {
  return Array.from({ length: slots }, (_, index) =>
    makeField({
      field: `experience_information.${index}.company`,
      label: 'Firma Adı',
      aliases: [`FİRMA ADI ${index + 1}`],
      group: 'experience_information',
      group_label: 'İş Deneyimi',
      group_index: index,
      group_field: 'company',
    }),
  )
}

function setup(options: {
  fields?: APIImportField[]
  mappings?: APIImportMapping[]
  headers?: string[]
} = {}) {
  const fields = ref(options.fields ?? [])
  const mappings = ref(options.mappings ?? [])
  const headers = ref(options.headers ?? [])

  const mapping = useColumnMapping({
    fields: () => fields.value,
    mappings: () => mappings.value,
    detectedHeaders: () => headers.value,
    label: (_field, fallback) => fallback,
    sectionLabel: (_group, fallback) => fallback,
  })

  mapping.buildLocalMappings()

  return { ...mapping, fields, mappings, headers }
}

describe('useColumnMapping rows', () => {
  it('covers every catalogue field, mapped or not', () => {
    const { rows } = setup({
      fields: [makeField(), makeField({ field: 'phone', label: 'Telefon' })],
      mappings: [makeMapping()],
    })

    expect(rows.value.map((row) => row.target)).toEqual(['email', 'phone'])
    expect(rows.value[0].proposed).toBe(true)
    expect(rows.value[1].proposed).toBe(false)
  })

  it('keeps a mapped target the catalogue does not describe', () => {
    const { rows } = setup({
      fields: [makeField()],
      mappings: [makeMapping(), makeMapping({ id: 2, source_column: 'X', target_field: '_legacy' })],
    })

    // Otherwise a stale template target would import invisibly, with no way to
    // see or clear it.
    expect(rows.value.map((row) => row.target)).toEqual(['email', '_legacy'])
  })

  it('orders flat fields before sections, and sections by slot', () => {
    const { rows } = setup({
      fields: [
        ...experienceFields(2).reverse(),
        makeField({ field: 'phone', label: 'Telefon' }),
        makeField(),
      ],
    })

    expect(rows.value.map((row) => row.target)).toEqual([
      'phone',
      'email',
      'experience_information.0.company',
      'experience_information.1.company',
    ])
  })
})

describe('useColumnMapping prefill', () => {
  it('seeds a confirmed or high-confidence proposal only', () => {
    const { localMappings } = setup({
      fields: [
        makeField(),
        makeField({ field: 'phone', label: 'Telefon' }),
        makeField({ field: 'notes', label: 'Notlar' }),
        makeField({ field: 'city', label: 'Şehir' }),
      ],
      mappings: [
        makeMapping({ is_confirmed: true, confidence_score: 0.5 }),
        makeMapping({ id: 2, source_column: 'TEL', target_field: 'phone', is_confirmed: false, confidence_score: 0.85 }),
        makeMapping({ id: 3, source_column: 'NOT', target_field: 'notes', is_confirmed: false, confidence_score: 0.6 }),
      ],
    })

    expect(localMappings.value).toEqual({
      email: 'EPOSTA',
      phone: 'TEL',
      notes: null,
      city: null,
    })
  })

  it('seeds a template mapping, which arrives confirmed', () => {
    const { localMappings, rows } = setup({
      fields: [makeField({ field: 'city', label: 'Şehir' })],
      mappings: [
        makeMapping({ source_column: 'İL', target_field: 'city', match_method: 'template', confidence_score: 1 }),
      ],
    })

    expect(localMappings.value.city).toBe('İL')
    // A templated field counts as proposed, so it shows under the default filter.
    expect(rows.value[0].proposed).toBe(true)
  })

  it('opens the sections its prefills or required fields touch', () => {
    const { isExpanded } = setup({
      fields: [
        ...experienceFields(2),
        makeField({
          field: 'education_information.0.school',
          group: 'education_information',
          group_label: 'Eğitim',
          group_index: 0,
          group_field: 'school',
        }),
      ],
      mappings: [
        makeMapping({
          source_column: 'FİRMA ADI 1',
          target_field: 'experience_information.0.company',
          confidence_score: 1,
        }),
      ],
    })

    expect(isExpanded('experience_information')).toBe(true)
    expect(isExpanded('education_information')).toBe(false)
  })
})

describe('useColumnMapping filter and search', () => {
  it('hides the empty slots until the scope is widened', () => {
    const mapping = setup({
      fields: [makeField({ required: true }), ...experienceFields(12)],
      mappings: [
        makeMapping({
          source_column: 'FİRMA ADI 1',
          target_field: 'experience_information.0.company',
          confidence_score: 1,
        }),
      ],
    })

    expect(mapping.visibleRows.value.map((row) => row.target)).toEqual([
      'email',
      'experience_information.0.company',
    ])

    mapping.filterMode.value = 'all'
    expect(mapping.visibleRows.value).toHaveLength(13)
  })

  it('searches the whole catalogue, whatever the scope', () => {
    const mapping = setup({
      fields: [makeField({ required: true }), ...experienceFields(12)],
      mappings: [makeMapping()],
    })

    expect(mapping.filterMode.value).toBe('relevant')

    // Typing a field's name is how the user asks for one the scope hides.
    mapping.search.value = 'firma adi 9'
    expect(mapping.visibleRows.value.map((row) => row.target)).toEqual([
      'experience_information.8.company',
    ])
  })

  it('matches label, key, alias, section label and the selected header', () => {
    const mapping = setup({
      fields: [makeField({ field: 'phone', label: 'Telefon', aliases: ['CEP TEL'] }), ...experienceFields(3)],
      mappings: [makeMapping({ source_column: 'CEP TEL', target_field: 'phone', confidence_score: 1 })],
      headers: ['CEP TEL'],
    })
    mapping.filterMode.value = 'all'

    const targets = () => mapping.visibleRows.value.map((row) => row.target)

    mapping.search.value = 'telefon'
    expect(targets()).toEqual(['phone'])

    mapping.search.value = 'phone'
    expect(targets()).toEqual(['phone'])

    mapping.search.value = 'cep tel'
    expect(targets()).toEqual(['phone'])

    // Folded: the user is not going to type İ.
    mapping.search.value = 'is deneyimi'
    expect(targets()).toHaveLength(3)

    mapping.search.value = 'firma adi 2'
    expect(targets()).toEqual(['experience_information.1.company'])
  })

  it('force-expands sections while a search is active', () => {
    const mapping = setup({ fields: experienceFields(3) })

    expect(mapping.isExpanded('experience_information')).toBe(false)

    mapping.search.value = 'firma'
    expect(mapping.isExpanded('experience_information')).toBe(true)

    // The user's own toggle survives the search.
    mapping.search.value = ''
    expect(mapping.isExpanded('experience_information')).toBe(false)
  })
})

describe('useColumnMapping sections', () => {
  it('counts slots and mappings over the whole section, not the filtered rows', () => {
    const mapping = setup({
      fields: experienceFields(12),
      mappings: [
        makeMapping({
          source_column: 'FİRMA ADI 1',
          target_field: 'experience_information.0.company',
          confidence_score: 1,
          is_required: false,
        }),
      ],
    })

    const section = mapping.sections.value.find((s) => s.key === 'experience_information')!

    expect(section.slotCount).toBe(12)
    expect(section.mappedCount).toBe(1)
    expect(section.rows).toHaveLength(1)
    expect(section.slots.map((slot) => slot.index)).toEqual([0])
  })

  it('flags a section holding a required field with nothing mapped', () => {
    const mapping = setup({
      fields: experienceFields(2).map((field, index) =>
        index === 0 ? { ...field, required: true } : field,
      ),
    })

    const section = mapping.sections.value.find((s) => s.key === 'experience_information')!
    expect(section.requiredUnmappedCount).toBe(1)
  })
})

describe('useColumnMapping header conflicts', () => {
  it('moves a header off its previous owner, and can put it back', () => {
    const mapping = setup({
      fields: [makeField(), makeField({ field: 'work_email', label: 'İş E-postası' })],
      mappings: [makeMapping({ confidence_score: 1 })],
      headers: ['EPOSTA'],
    })

    expect(mapping.localMappings.value.email).toBe('EPOSTA')

    mapping.assignHeader('work_email', 'EPOSTA')

    expect(mapping.localMappings.value).toEqual({ email: null, work_email: 'EPOSTA' })
    expect(mapping.lastMove.value).toEqual({ header: 'EPOSTA', from: 'email', to: 'work_email' })

    mapping.undoMove()

    expect(mapping.localMappings.value).toEqual({ email: 'EPOSTA', work_email: null })
    expect(mapping.lastMove.value).toBeNull()
  })

  it('reports which field holds a header, and which are left over', () => {
    const mapping = setup({
      fields: [makeField()],
      mappings: [makeMapping({ confidence_score: 1 })],
      headers: ['EPOSTA', 'NOTLAR'],
    })

    expect(mapping.takenBy.value).toEqual({ EPOSTA: 'E-posta' })
    expect(mapping.unmappedHeaders.value).toEqual(['NOTLAR'])
  })

  it('offers each file column once, and never a blank one', () => {
    const mapping = setup({ headers: ['AD', '', 'AD', 'SOYAD'] })

    // A repeated header is read once and a blank one cannot be addressed, so
    // neither could carry a mapping the import would honour.
    expect(mapping.headerOptions.value.map((option) => option.value)).toEqual(['AD', 'SOYAD'])
  })
})

describe('useColumnMapping scores', () => {
  it("keeps the backend's number for a pair it scored, and scores the rest locally", () => {
    const mapping = setup({
      fields: [makeField({ aliases: ['EPOSTA'] })],
      mappings: [makeMapping({ confidence_score: 0.9 })],
      headers: ['EPOSTA', 'email'],
    })

    expect(mapping.scores.value.email).toBe(0.9)

    mapping.assignHeader('email', 'email')
    expect(mapping.scores.value.email).toBe(1)

    mapping.assignHeader('email', null)
    expect(mapping.scores.value.email).toBe(0)
  })
})

describe('useColumnMapping save payload', () => {
  it('sends the selections, and clears the columns that lost their target', () => {
    const mapping = setup({
      fields: [makeField(), makeField({ field: 'phone', label: 'Telefon' })],
      mappings: [
        makeMapping({ confidence_score: 1 }),
        makeMapping({ id: 2, source_column: 'TEL', target_field: 'phone', confidence_score: 1 }),
        // Never matched and never confirmed: already blank on the backend.
        makeMapping({
          id: 3,
          source_column: 'NOTLAR',
          target_field: null as unknown as string,
          confidence_score: 0,
          match_method: 'none',
          is_required: false,
          is_confirmed: false,
        }),
      ],
      headers: ['EPOSTA', 'TEL', 'NOTLAR'],
    })

    mapping.assignHeader('phone', null)

    const payload = mapping.buildStartPayload()

    expect(payload.mappings).toEqual({ email: 'EPOSTA' })
    expect(payload.columns).toEqual([
      { source_column: 'EPOSTA', target_field: 'email', confirmed: true },
      // An auto-confirmed column keeps importing until something says otherwise.
      { source_column: 'TEL', target_field: null, confirmed: false },
    ])
  })

  it('never names the same column twice', () => {
    const mapping = setup({
      fields: [makeField(), makeField({ field: 'work_email', label: 'İş E-postası' })],
      mappings: [makeMapping({ confidence_score: 1 })],
      headers: ['EPOSTA'],
    })

    mapping.assignHeader('work_email', 'EPOSTA')

    const { columns } = mapping.buildStartPayload()
    expect(columns).toEqual([
      { source_column: 'EPOSTA', target_field: 'work_email', confirmed: true },
    ])
  })
})

describe('useColumnMapping revealRequiredUnmapped', () => {
  it('clears the search and opens the sections hiding a required field', () => {
    const mapping = setup({
      fields: experienceFields(2).map((field, index) =>
        index === 1 ? { ...field, required: true } : field,
      ),
    })

    mapping.search.value = 'nothing matches this'
    mapping.filterMode.value = 'all'
    mapping.expandedGroups.value = { experience_information: false }

    mapping.revealRequiredUnmapped()

    expect(mapping.search.value).toBe('')
    expect(mapping.filterMode.value).toBe('relevant')
    expect(mapping.isExpanded('experience_information')).toBe(true)
    expect(mapping.visibleRows.value.map((row) => row.target)).toEqual([
      'experience_information.1.company',
    ])
  })
})
