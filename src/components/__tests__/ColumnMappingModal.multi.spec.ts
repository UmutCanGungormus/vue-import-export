import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ColumnMappingModal from '../ColumnMappingModal.vue'
import type { APIImportField, APIImportMapping } from '../../types.js'

/**
 * The sample workbook's note columns, mapped the way a user actually tries it.
 *
 * The file carries `1. Not`, `2. Not`, `3. Not` and the catalogue offers targets
 * with the very same labels, so every column auto-matches its namesake. Pointing
 * two of those columns at one note is the case this covers: the row has to offer
 * a second picker, take the header off the row that auto-claimed it, and expose
 * the combine choice.
 */
function noteField(index: number): APIImportField {
  return {
    field: `note_information.${index}.note`,
    label: `${index + 1}. Not`,
    required: false,
    type: 'string',
    multi: true,
    aliases: [`Not ${index + 1}`],
    group: null,
    group_label: null,
    group_index: null,
    group_field: null,
  }
}

function noteMapping(index: number): APIImportMapping {
  return {
    id: index + 2,
    source_column: `${index + 1}. Not`,
    target_field: `note_information.${index}.note`,
    confidence_score: 0.95,
    match_method: 'label',
    is_required: false,
    is_confirmed: true,
  }
}

function mountModal() {
  return mount(ColumnMappingModal, {
    props: {
      show: true,
      importId: 7,
      detectedHeaders: ['E-posta', '1. Not', '2. Not', '3. Not'],
      fields: [
        {
          field: 'email',
          label: 'E-posta',
          required: true,
          type: 'string',
          multi: false,
          aliases: [],
          group: null,
          group_label: null,
          group_index: null,
          group_field: null,
        },
        noteField(0),
        noteField(1),
        noteField(2),
      ],
      mappings: [
        {
          id: 1,
          source_column: 'E-posta',
          target_field: 'email',
          confidence_score: 1,
          match_method: 'alias',
          is_required: true,
          is_confirmed: true,
        },
        noteMapping(0),
        noteMapping(1),
        noteMapping(2),
      ],
    },
  })
}

function rowFor(wrapper: VueWrapper, target: string) {
  const row = wrapper.find(`tr[data-target="${target}"]`)
  if (!row.exists()) throw new Error(`No row rendered for ${target}`)
  return row
}

/** The row's "add another column" button, if the row offers one. */
function addColumnButton(wrapper: VueWrapper, target: string) {
  return rowFor(wrapper, target)
    .findAll('button')
    .find((button) => button.text().includes('Add another column'))
}

/**
 * Picks a header in one of the row's pickers.
 *
 * @param pickerIndex 0 for the target's first column, 1 for the next, …
 */
async function pick(wrapper: VueWrapper, target: string, pickerIndex: number, header: string) {
  const row = rowFor(wrapper, target)

  // Each picker renders its trigger plus, once it holds a value, a clear
  // button; only the triggers are addressable by picker position.
  const triggers = row
    .findAll('button')
    .filter(
      (button) =>
        button.attributes('data-testid') !== 'select-clear' &&
        !button.text().includes('Add another column') &&
        !button.text().includes('Merged text') &&
        !button.text().includes('JSON'),
    )

  await triggers[pickerIndex].trigger('click')

  const option = row.findAll('li').find((li) => li.text().startsWith(header))
  if (!option) throw new Error(`No option "${header}" in picker ${pickerIndex} of ${target}`)
  await option.trigger('click')
}

describe('mapping two note columns onto one note target', () => {
  it('offers a second column on a multi target', () => {
    const wrapper = mountModal()

    expect(addColumnButton(wrapper, 'note_information.0.note')).toBeTruthy()
  })

  it('does not offer one on a target that takes a single column', () => {
    const wrapper = mountModal()

    expect(addColumnButton(wrapper, 'email')).toBeUndefined()
  })

  it('takes the second column off the row that auto-claimed it', async () => {
    const wrapper = mountModal()

    await addColumnButton(wrapper, 'note_information.0.note')!.trigger('click')
    await pick(wrapper, 'note_information.0.note', 1, '2. Not')

    const first = rowFor(wrapper, 'note_information.0.note')
    expect(first.text()).toContain('1. Not')
    expect(first.text()).toContain('2. Not')

    // The combine choice appears only once a target really has two columns.
    expect(first.text()).toContain('Combine as')

    // And the row that used to own `2. Not` is left empty rather than sharing it.
    const second = rowFor(wrapper, 'note_information.1.note')
    expect(second.text()).toContain('Select a column from file')
  })
})
