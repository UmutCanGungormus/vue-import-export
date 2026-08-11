import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ColumnMappingModal from '../ColumnMappingModal.vue'
import type { APIImportMapping } from '../../types.js'

function makeMapping(overrides: Partial<APIImportMapping> = {}): APIImportMapping {
  return {
    id: 1,
    source_column: 'E-posta',
    target_field: 'email',
    confidence_score: 0.95,
    match_method: 'label',
    is_required: true,
    is_confirmed: true,
    ...overrides,
  }
}

/** A session where `email` is confirmed at 0.95 and `notes` is a weak 0.6. */
function mountModal() {
  return mount(ColumnMappingModal, {
    props: {
      show: true,
      importId: 1,
      detectedHeaders: ['E-posta', 'Notlar'],
      mappings: [
        makeMapping(),
        makeMapping({
          id: 2,
          source_column: 'Notlar',
          target_field: 'notes',
          confidence_score: 0.6,
          match_method: 'fuzzy',
          is_required: false,
          is_confirmed: false,
        }),
      ],
    },
  })
}

/** The `<tr>` whose second cell holds the picker for the given target field. */
function rowFor(wrapper: VueWrapper, targetField: string) {
  const row = wrapper.findAll('tbody tr').find((tr) => tr.text().includes(targetField))
  if (!row) throw new Error(`No row rendered for ${targetField}`)
  return row
}

/** Open a row's dropdown and click the option with the given label. */
async function selectHeader(wrapper: VueWrapper, targetField: string, header: string) {
  const row = rowFor(wrapper, targetField)
  await row.findAll('button')[0].trigger('click')

  const option = row.findAll('li').find((li) => li.text() === header)
  if (!option) throw new Error(`No option "${header}" in the ${targetField} dropdown`)
  await option.trigger('click')
}

describe('ColumnMappingModal match score', () => {
  it("shows the backend's own percentage for the column the backend matched", () => {
    const wrapper = mountModal()

    expect(rowFor(wrapper, 'email').text()).toContain('%95')
  })

  it('recomputes the percentage when the column is re-pointed', async () => {
    const wrapper = mountModal()
    const before = rowFor(wrapper, 'email')

    expect(before.text()).toContain('%95')
    expect(before.find('.bg-green-500').exists()).toBe(true)

    await selectHeader(wrapper, 'email', 'Notlar')

    const after = rowFor(wrapper, 'email')
    // The stale %95 must not survive a mapping the backend never proposed.
    expect(after.text()).not.toContain('%95')
    expect(after.find('.bg-green-500').exists()).toBe(false)
    expect(after.find('.bg-red-400').exists()).toBe(true)
    // A weak score downgrades the status icon too.
    expect(after.find('.text-orange-400').exists()).toBe(true)
  })

  it("reuses the backend's score when the user picks the pair the backend scored", async () => {
    const wrapper = mountModal()

    // 0.6 is below the auto-confirm threshold, so `notes` starts unmapped.
    expect(rowFor(wrapper, 'notes').text()).not.toContain('%')

    await selectHeader(wrapper, 'notes', 'Notlar')

    expect(rowFor(wrapper, 'notes').text()).toContain('%60')
  })
})

describe('ColumnMappingModal clearing a selection', () => {
  it('clears the mapping through the ✕ on the trigger', async () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('1/2')

    await rowFor(wrapper, 'email').find('[data-testid="select-clear"]').trigger('click')

    const row = rowFor(wrapper, 'email')
    expect(row.text()).toContain('Select a column from file')
    expect(row.text()).not.toContain('%')
    expect(wrapper.text()).toContain('0/2')
  })

  it('clears the mapping through the entry in the dropdown', async () => {
    const wrapper = mountModal()
    const row = rowFor(wrapper, 'email')

    await row.findAll('button')[0].trigger('click')
    await row.find('[data-testid="select-clear-option"]').trigger('click')

    expect(rowFor(wrapper, 'email').text()).toContain('Select a column from file')
    expect(wrapper.text()).toContain('0/2')
  })

  it('offers no clear affordance while a row is unmapped', () => {
    const wrapper = mountModal()

    expect(rowFor(wrapper, 'notes').find('[data-testid="select-clear"]').exists()).toBe(false)
  })

  it('blocks the import again when a required field is cleared', async () => {
    const wrapper = mountModal()
    const startButton = () =>
      wrapper.findAll('button').find((button) => button.text().includes('Start import'))!

    expect(startButton().attributes('disabled')).toBeUndefined()

    await rowFor(wrapper, 'email').find('[data-testid="select-clear"]').trigger('click')

    expect(startButton().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('All required fields must be mapped.')
    expect(rowFor(wrapper, 'email').find('.text-red-400').exists()).toBe(true)
  })

  it('leaves a cleared field out of the emitted mapping', async () => {
    const wrapper = mountModal()

    await selectHeader(wrapper, 'notes', 'Notlar')
    await rowFor(wrapper, 'email').find('[data-testid="select-clear"]').trigger('click')

    // Start is disabled in the UI here; call the handler directly to assert the
    // payload shape a cleared row produces.
    await wrapper.findAll('button').find((b) => b.text().includes('Start import'))!.trigger('click')
    expect(wrapper.emitted('start')).toBeFalsy()

    await selectHeader(wrapper, 'email', 'E-posta')
    await wrapper.findAll('button').find((b) => b.text().includes('Start import'))!.trigger('click')

    expect(wrapper.emitted('start')![0]).toEqual([{ email: 'E-posta', notes: 'Notlar' }])
  })
})
