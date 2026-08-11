import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ImportManager from '../ImportManager.vue'
import { IMPORT_API_KEY, NOTIFY_KEY } from '../../adapters.js'
import type { APIImport } from '../../types.js'

function makeImport(overrides: Partial<APIImport> = {}): APIImport {
  return {
    id: 1,
    importable_type: 'App\\Models\\Cv',
    file_name: 'cvs.xlsx',
    status: 'completed',
    total_rows: 5,
    processed_rows: 5,
    successful_rows: 5,
    failed_rows: 0,
    progress_percentage: 100,
    detected_headers: ['Ad Soyad'],
    started_at: null,
    completed_at: null,
    created_at: '2026-08-10T10:00:00Z',
    mappings: [],
    ...overrides,
  }
}

/** Minimal client covering only what mounting and exporting touch. */
function makeApi(items: APIImport[]) {
  return {
    getAllowedModels: vi.fn().mockResolvedValue({ data: [] }),
    listImports: vi.fn().mockResolvedValue({
      data: items,
      meta: { current_page: 1, last_page: 1, per_page: 15, total: items.length },
    }),
    exportModel: vi.fn().mockResolvedValue({ data: 'a,b\n1,2\n' }),
  }
}

async function mountManager(items: APIImport[]) {
  const api = makeApi(items)
  const wrapper = mount(ImportManager, {
    props: { defaultExportModel: 'App\\Models\\Cv' },
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

/** The export action, wherever it currently lives in the layout. */
function exportButton(wrapper: VueWrapper) {
  return wrapper
    .findAll('button')
    .find((button) => button.text().includes('Dışa aktar') || button.text().includes('Export'))
}

beforeEach(() => {
  // jsdom implements none of these, and exportData drives a download through
  // all three: object URL in, anchor click, object URL out.
  window.URL.createObjectURL = vi.fn(() => 'blob:stub')
  window.URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

describe('ImportManager export action', () => {
  it('is offered when the list has records', async () => {
    const { wrapper } = await mountManager([makeImport()])

    expect(exportButton(wrapper)).toBeTruthy()
  })

  it('is still offered when no file has ever been uploaded', async () => {
    const { wrapper } = await mountManager([])

    // The empty state is showing, and export must survive it: it exports model
    // data, not the import sessions this table lists.
    expect(wrapper.text()).toContain('Henüz dosya yüklenmedi')
    expect(exportButton(wrapper)).toBeTruthy()
  })

  it('exports the default model when the list is empty', async () => {
    const { wrapper, api } = await mountManager([])

    await exportButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(api.exportModel).toHaveBeenCalledWith('App\\Models\\Cv')
  })

  it('ignores a second click while an export is in flight', async () => {
    const { wrapper, api } = await mountManager([])
    let release: (value: unknown) => void = () => {}
    api.exportModel.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    await exportButton(wrapper)!.trigger('click')
    expect(exportButton(wrapper)!.attributes('disabled')).toBeDefined()

    await exportButton(wrapper)!.trigger('click')
    expect(api.exportModel).toHaveBeenCalledTimes(1)

    release({ data: 'a,b\n' })
    await flushPromises()
    expect(exportButton(wrapper)!.attributes('disabled')).toBeUndefined()
  })
})
