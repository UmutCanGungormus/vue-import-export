import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileItem from '../FileItem.vue'
import type { APIImport } from '../../types.js'

function makeImport(overrides: Partial<APIImport> = {}): APIImport {
  return {
    id: 1,
    importable_type: 'App\\Models\\User',
    file_name: 'users.csv',
    status: 'completed',
    total_rows: 10,
    processed_rows: 10,
    successful_rows: 9,
    failed_rows: 1,
    progress_percentage: 100,
    detected_headers: ['name', 'email'],
    started_at: null,
    completed_at: null,
    created_at: '2026-06-18T10:00:00Z',
    mappings: [],
    ...overrides,
  }
}

describe('FileItem', () => {
  it('renders the file name, module label, status label and type badge', () => {
    const wrapper = mount(FileItem, {
      props: {
        item: makeImport(),
        moduleLabel: 'Users',
        statusLabel: 'Completed',
      },
    })

    expect(wrapper.text()).toContain('users.csv')
    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('Completed')
    // file extension badge is upper-cased
    expect(wrapper.text()).toContain('CSV')
  })

  it('emits "delete" with the item when the delete action is clicked', async () => {
    const item = makeImport()
    const wrapper = mount(FileItem, {
      props: { item, moduleLabel: 'Users', statusLabel: 'Completed' },
    })

    // The last button in the row is the delete action.
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')

    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')![0]).toEqual([item])
  })

  it('emits "download" only when there are failed rows', async () => {
    const item = makeImport({ failed_rows: 2 })
    const wrapper = mount(FileItem, {
      props: { item, moduleLabel: 'Users', statusLabel: 'Completed' },
    })

    // With failed rows, the download button is rendered as the first action.
    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('download')).toBeTruthy()
    expect(wrapper.emitted('download')![0]).toEqual([item])
  })
})
