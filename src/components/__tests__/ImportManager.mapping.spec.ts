import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ImportManager from '../ImportManager.vue'
import ColumnMappingModal from '../ColumnMappingModal.vue'
import UploadInput from '../UploadInput.vue'
import { IMPORT_API_KEY, NOTIFY_KEY } from '../../adapters.js'
import type { APIImport, APIImportField, APIImportMapping, MappingColumnUpdate } from '../../types.js'

const MODEL = 'App\\Models\\FirmDepartment'

function makeSession(overrides: Partial<APIImport> = {}): APIImport {
  return {
    id: 42,
    importable_type: MODEL,
    file_name: 'departments.csv',
    status: 'mapping',
    total_rows: 3,
    processed_rows: 0,
    successful_rows: 0,
    failed_rows: 0,
    progress_percentage: 0,
    detected_headers: ['Kod', 'Ad'],
    started_at: null,
    completed_at: null,
    created_at: '2026-08-14T10:00:00Z',
    mappings: [makeMapping()],
    ...overrides,
  }
}

function makeMapping(overrides: Partial<APIImportMapping> = {}): APIImportMapping {
  return {
    id: 1,
    source_column: 'Kod',
    target_field: 'code',
    confidence_score: 1,
    match_method: 'exact',
    is_required: true,
    is_confirmed: true,
    ...overrides,
  }
}

function makeField(overrides: Partial<APIImportField> = {}): APIImportField {
  return {
    field: 'code',
    label: 'Kod',
    required: true,
    type: 'string',
    aliases: ['Kod'],
    group: null,
    group_label: null,
    group_index: null,
    group_field: null,
    ...overrides,
  }
}

/** Client covering the upload → map → start path. */
function makeApi(meta?: { fields: APIImportField[] }) {
  return {
    getAllowedModels: vi.fn().mockResolvedValue({ data: [{ model: MODEL, name: 'Departman' }] }),
    listImports: vi.fn().mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 },
    }),
    initializeImport: vi.fn().mockResolvedValue({ data: makeSession(), meta }),
    listMappings: vi.fn().mockResolvedValue({ data: [makeMapping()] }),
    mappingSuggestions: vi.fn().mockResolvedValue({
      data: [
        { field: 'code', label: 'Kod', confidence: 1, required: true, type: 'string' },
        {
          field: 'experience_information.0.company',
          label: 'Firma Adı',
          confidence: 1,
          required: false,
          type: 'string',
          group: 'experience_information',
          group_label: 'İş Deneyimi',
          group_index: 0,
          group_field: 'company',
        },
      ],
    }),
    updateMappingsBatch: vi.fn().mockResolvedValue({ data: makeSession() }),
    startImport: vi.fn().mockResolvedValue({ data: null }),
    getProgress: vi.fn().mockResolvedValue({
      data: {
        status: 'processing',
        total_rows: '3',
        processed_rows: '0',
        successful_rows: '0',
        failed_rows: '0',
        progress_percentage: '0',
      },
    }),
  }
}

async function mountManager(meta?: { fields: APIImportField[] }) {
  const api = makeApi(meta)
  const wrapper = mount(ImportManager, {
    props: { initialModel: MODEL, defaultExportModel: MODEL },
    global: {
      plugins: [createPinia()],
      provide: {
        [IMPORT_API_KEY as unknown as symbol]: api,
        [NOTIFY_KEY as unknown as symbol]: () => {},
      },
    },
  })
  await flushPromises()
  return { wrapper, api }
}

/** Pick a file and press Upload, the way the user does. */
async function upload(wrapper: VueWrapper) {
  wrapper
    .findComponent(UploadInput)
    .vm.$emit('update:modelValue', new File(['Kod,Ad\nA,B\n'], 'departments.csv'))
  await flushPromises()

  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes('Yükle'))!
  await button.trigger('click')
  await flushPromises()
}

describe('ImportManager field catalogue', () => {
  it('takes the catalogue from the upload response', async () => {
    const { wrapper, api } = await mountManager({ fields: [makeField()] })

    await upload(wrapper)

    expect(api.mappingSuggestions).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ColumnMappingModal).props('fields')).toEqual([makeField()])
  })

  it('falls back to the suggestions endpoint when the response carries none', async () => {
    const { wrapper, api } = await mountManager()

    await upload(wrapper)

    expect(api.mappingSuggestions).toHaveBeenCalledTimes(1)
    expect(api.mappingSuggestions).toHaveBeenCalledWith(42)

    const fields = wrapper.findComponent(ColumnMappingModal).props('fields') as APIImportField[]
    expect(fields.map((field) => field.field)).toEqual([
      'code',
      'experience_information.0.company',
    ])
    // The repeat-group metadata has to survive the fallback, or the editor cannot
    // fold its sections.
    expect(fields[1].group).toBe('experience_information')
    expect(fields[1].group_index).toBe(0)
  })

  it('keeps working when the fallback fails', async () => {
    const { wrapper, api } = await mountManager()
    api.mappingSuggestions.mockRejectedValueOnce(new Error('boom'))

    await upload(wrapper)

    const modal = wrapper.findComponent(ColumnMappingModal)
    expect(modal.props('fields')).toEqual([])
    // Rows are derived from the session's mappings instead.
    expect(modal.find('tr[data-target="code"]').exists()).toBe(true)
  })
})

describe('ImportManager start import', () => {
  it("posts the editor's column updates verbatim, then starts", async () => {
    const { wrapper, api } = await mountManager({ fields: [makeField()] })
    await upload(wrapper)

    const columns: MappingColumnUpdate[] = [
      { source_column: 'Kod', target_field: 'code', confirmed: true },
      { source_column: 'Ad', target_field: null, confirmed: false },
    ]
    wrapper.findComponent(ColumnMappingModal).vm.$emit('start', { code: 'Kod' }, columns)
    await flushPromises()

    expect(api.updateMappingsBatch).toHaveBeenCalledWith(42, { columns })
    expect(api.startImport).toHaveBeenCalledWith(42)
  })

  it('derives the payload for a host on the single-argument contract', async () => {
    const { wrapper, api } = await mountManager({ fields: [makeField()] })
    await upload(wrapper)

    wrapper.findComponent(ColumnMappingModal).vm.$emit('start', { code: 'Kod' })
    await flushPromises()

    expect(api.updateMappingsBatch).toHaveBeenCalledWith(42, {
      columns: [{ source_column: 'Kod', target_field: 'code', confirmed: true }],
    })
  })

  it('skips the save when there is nothing to persist', async () => {
    const { wrapper, api } = await mountManager({ fields: [makeField()] })
    await upload(wrapper)

    // An empty `columns` array is a 422, and "nothing changed" is not an error.
    wrapper.findComponent(ColumnMappingModal).vm.$emit('start', {}, [])
    await flushPromises()

    expect(api.updateMappingsBatch).not.toHaveBeenCalled()
    expect(api.startImport).toHaveBeenCalledWith(42)
  })
})
