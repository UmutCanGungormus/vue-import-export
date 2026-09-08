import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useColumnMapping } from '../useColumnMapping.js'
import type { APIImportField, APIImportMapping } from '../../types.js'

/**
 * Feeding one target from several file columns.
 *
 * Only a field the backend marks `multi` offers it — free text, where joining
 * two cells produces something readable. The editor keeps the first column as
 * the row's own selection so every count, score and filter keeps working, and
 * carries the rest alongside it.
 */
function makeField(overrides: Partial<APIImportField> = {}): APIImportField {
  return {
    field: 'note',
    label: 'Not',
    required: false,
    type: 'string',
    multi: true,
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
    source_column: 'Görüşme 1',
    target_field: 'note',
    confidence_score: 0.9,
    match_method: 'alias',
    is_required: false,
    is_confirmed: true,
    ...overrides,
  }
}

function setup(
  options: {
    fields?: APIImportField[]
    mappings?: APIImportMapping[]
    headers?: string[]
  } = {},
) {
  const fields = ref(options.fields ?? [makeField(), makeField({ field: 'name', label: 'Ad', multi: false })])
  const mappings = ref(options.mappings ?? [])
  const headers = ref(options.headers ?? ['Görüşme 1', 'Görüşme 2', 'Ad Soyad'])

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

describe('multi-column targets', () => {
  it('carries the extra columns next to the first one', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')

    expect(m.columnsOf('note')).toEqual(['Görüşme 1', 'Görüşme 2'])
    expect(m.localMappings.value.note).toBe('Görüşme 1')
  })

  it('defaults a second column to merge and remembers a different pick', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    expect(m.strategyOf('note')).toBeNull()

    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')
    expect(m.strategyOf('note')).toBe('merge')

    m.setStrategy('note', 'json')
    expect(m.strategyOf('note')).toBe('json')
  })

  it('sends every column of a combined target, each carrying the strategy', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')
    m.setStrategy('note', 'json')

    const { columns } = m.buildStartPayload()

    expect(columns).toEqual([
      { source_column: 'Görüşme 1', target_field: 'note', confirmed: true, multi_strategy: 'json' },
      { source_column: 'Görüşme 2', target_field: 'note', confirmed: true, multi_strategy: 'json' },
    ])
  })

  it('leaves the strategy key off a target fed by one column', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')

    expect(m.buildStartPayload().columns).toEqual([
      { source_column: 'Görüşme 1', target_field: 'note', confirmed: true },
    ])
  })

  it('drops the strategy when the target falls back to one column', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')
    m.assignExtraHeader('note', 0, null)

    expect(m.columnsOf('note')).toEqual(['Görüşme 1'])
    expect(m.strategyOf('note')).toBeNull()
  })

  it('promotes an extra column when the first one is cleared', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')

    m.assignHeader('note', null)

    // The row is what its first column is; clearing it must not leave a
    // combined target with a hole where its head was.
    expect(m.columnsOf('note')).toEqual(['Görüşme 2'])
    expect(m.strategyOf('note')).toBeNull()
  })

  it('counts an extra column as taken, so another field cannot silently share it', () => {
    const m = setup()

    m.assignHeader('note', 'Görüşme 1')
    m.addExtraColumn('note')
    m.assignExtraHeader('note', 0, 'Görüşme 2')

    expect(m.takenBy.value['Görüşme 2']).toBe('Not')
    expect(m.unmappedHeaders.value).toEqual(['Ad Soyad'])

    // Claiming it for another field takes it off the combined target.
    m.assignHeader('name', 'Görüşme 2')

    expect(m.columnsOf('note')).toEqual(['Görüşme 1'])
    expect(m.strategyOf('note')).toBeNull()
  })

  it('reopens a session with the columns it was saved with, in file order', () => {
    const m = setup({
      mappings: [
        makeMapping({ id: 2, source_column: 'Görüşme 2', multi_strategy: 'json' }),
        makeMapping({ id: 1, source_column: 'Görüşme 1', multi_strategy: 'json' }),
      ],
    })

    expect(m.columnsOf('note')).toEqual(['Görüşme 1', 'Görüşme 2'])
    expect(m.strategyOf('note')).toBe('json')
  })
})
