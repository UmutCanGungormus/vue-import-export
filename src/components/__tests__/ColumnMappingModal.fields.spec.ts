import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ColumnMappingModal from '../ColumnMappingModal.vue'
import type { APIImportField, APIImportMapping } from '../../types.js'

function makeField(overrides: Partial<APIImportField> = {}): APIImportField {
  return {
    field: 'email',
    label: 'E-posta',
    required: true,
    type: 'string',
    aliases: [],
    group: null,
    group_label: null,
    group_index: null,
    group_field: null,
    ...overrides,
  }
}

/** A repeating section of `slots` slots, one leaf each. */
function experienceFields(slots: number): APIImportField[] {
  return Array.from({ length: slots }, (_, index) =>
    makeField({
      field: `experience_information.${index}.company`,
      label: 'Firma Adı',
      required: false,
      aliases: [`FİRMA ADI ${index + 1}`],
      group: 'experience_information',
      group_label: 'İş Deneyimi',
      group_index: index,
      group_field: 'company',
    }),
  )
}

function makeMapping(overrides: Partial<APIImportMapping> = {}): APIImportMapping {
  return {
    id: 1,
    source_column: 'EPOSTA',
    target_field: 'email',
    confidence_score: 1,
    match_method: 'alias',
    is_required: true,
    is_confirmed: true,
    ...overrides,
  }
}

/**
 * A session whose file carries three columns: the e-mail (auto-matched), the
 * first job's company, and one the backend could not place.
 */
function mountModal(overrides: {
  fields?: APIImportField[]
  mappings?: APIImportMapping[]
  detectedHeaders?: string[]
} = {}) {
  return mount(ColumnMappingModal, {
    props: {
      show: true,
      importId: 7,
      detectedHeaders: overrides.detectedHeaders ?? ['EPOSTA', 'FİRMA ADI 1', 'NOTLAR'],
      fields: overrides.fields ?? [
        makeField(),
        makeField({ field: 'phone', label: 'Telefon', required: false }),
        ...experienceFields(12),
      ],
      mappings: overrides.mappings ?? [
        makeMapping(),
        makeMapping({
          id: 2,
          source_column: 'FİRMA ADI 1',
          target_field: 'experience_information.0.company',
          is_required: false,
        }),
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
    },
  })
}

/** Row keyed by target field — the section headers carry no `data-target`. */
function rowFor(wrapper: VueWrapper, target: string) {
  const row = wrapper.find(`tr[data-target="${target}"]`)
  if (!row.exists()) throw new Error(`No row rendered for ${target}`)
  return row
}

function startButton(wrapper: VueWrapper) {
  return wrapper.findAll('button').find((button) => button.text().includes('Start import'))!
}

async function selectHeader(wrapper: VueWrapper, target: string, header: string) {
  const row = rowFor(wrapper, target)
  await row.findAll('button')[0].trigger('click')

  const option = row.findAll('li').find((li) => li.text().startsWith(header))
  if (!option) throw new Error(`No option "${header}" in the ${target} dropdown`)
  await option.trigger('click')
}

describe('ColumnMappingModal with a field catalogue', () => {
  it('hides the untouched fields until the scope is widened', async () => {
    const wrapper = mountModal()

    // Mapped and required fields are what the user came to check.
    expect(wrapper.find('tr[data-target="email"]').exists()).toBe(true)
    expect(wrapper.find('tr[data-target="phone"]').exists()).toBe(false)

    await wrapper.find('[data-testid="filter-all"]').trigger('click')

    expect(wrapper.find('tr[data-target="phone"]').exists()).toBe(true)
  })

  it('maps a field the file never mentioned', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="filter-all"]').trigger('click')
    await selectHeader(wrapper, 'phone', 'NOTLAR')

    startButton(wrapper).trigger('click')
    await wrapper.vm.$nextTick()

    const [mappings, columns] = wrapper.emitted('start')![0] as [
      Record<string, string>,
      { source_column: string; target_field: string | null; confirmed: boolean }[],
    ]

    expect(mappings.phone).toBe('NOTLAR')
    expect(columns).toContainEqual({
      source_column: 'NOTLAR',
      target_field: 'phone',
      confirmed: true,
    })
  })

  it('clears a column the user un-mapped', async () => {
    const wrapper = mountModal()

    await rowFor(wrapper, 'experience_information.0.company')
      .find('[data-testid="select-clear"]')
      .trigger('click')

    startButton(wrapper).trigger('click')
    await wrapper.vm.$nextTick()

    const [, columns] = wrapper.emitted('start')![0] as [
      Record<string, string>,
      { source_column: string; target_field: string | null; confirmed: boolean }[],
    ]

    expect(columns).toContainEqual({
      source_column: 'FİRMA ADI 1',
      target_field: null,
      confirmed: false,
    })
    // A column that was already blank has nothing to clear.
    expect(columns.map((column) => column.source_column)).not.toContain('NOTLAR')
  })

  it('blocks the import on a required field the file does not carry', async () => {
    const wrapper = mountModal({
      fields: [makeField(), makeField({ field: 'first_name', label: 'Ad', required: true })],
      mappings: [makeMapping()],
    })

    expect(startButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('All required fields must be mapped.')
    expect(rowFor(wrapper, 'first_name').exists()).toBe(true)

    await selectHeader(wrapper, 'first_name', 'NOTLAR')

    expect(startButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('brings a hidden required field back into view', async () => {
    const wrapper = mountModal({
      fields: [
        makeField(),
        ...experienceFields(3).map((field, index) =>
          index === 2 ? { ...field, required: true } : field,
        ),
      ],
      mappings: [makeMapping()],
    })

    await wrapper.find('[data-testid="field-search"]').setValue('nothing matches this')
    expect(wrapper.find('tr[data-target="experience_information.2.company"]').exists()).toBe(false)

    await wrapper.find('[data-testid="reveal-required"]').trigger('click')

    expect(wrapper.find('tr[data-target="experience_information.2.company"]').exists()).toBe(true)
    expect((wrapper.find('[data-testid="field-search"]').element as HTMLInputElement).value).toBe('')
  })
})

describe('ColumnMappingModal sections', () => {
  it('summarises a section and folds it away', async () => {
    const wrapper = mountModal()
    const toggle = () => wrapper.find('[data-testid="section-toggle-experience_information"]')

    // 12 slots, one of them mapped — the section opened because of that mapping.
    expect(toggle().text()).toContain('12 slots')
    expect(toggle().text()).toContain('1 mapped')
    expect(toggle().attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('tr[data-target="experience_information.0.company"]').exists()).toBe(true)

    await toggle().trigger('click')

    // Collapsed rows leave the DOM: every row mounts a dropdown of its own.
    expect(toggle().attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('tr[data-target="experience_information.0.company"]').exists()).toBe(false)
  })

  it('starts a section collapsed when nothing in it is mapped or required', () => {
    const wrapper = mountModal({
      fields: [makeField(), ...experienceFields(4)],
      mappings: [makeMapping()],
    })

    expect(
      wrapper.find('[data-testid="section-toggle-experience_information"]').attributes('aria-expanded'),
    ).toBe('false')
  })

  it('opens every section holding a search hit', async () => {
    const wrapper = mountModal({
      fields: [makeField(), ...experienceFields(4)],
      mappings: [makeMapping()],
    })

    await wrapper.find('[data-testid="field-search"]').setValue('FİRMA ADI 3')

    expect(wrapper.find('tr[data-target="experience_information.2.company"]').exists()).toBe(true)
    expect(wrapper.find('tr[data-target="experience_information.0.company"]').exists()).toBe(false)
  })

  it('numbers the slots from one', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="filter-all"]').trigger('click')

    expect(wrapper.text()).toContain('1. İş Deneyimi')
    expect(wrapper.text()).toContain('12. İş Deneyimi')
  })

  it('tells the user when a search matches nothing', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="field-search"]').setValue('zzzz')

    expect(wrapper.text()).toContain('No field matches your search.')
  })
})

describe('ColumnMappingModal duplicate headers', () => {
  it('moves a header to its new field and offers the move back', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="filter-all"]').trigger('click')
    await selectHeader(wrapper, 'phone', 'EPOSTA')

    // The previous owner lost it, and the user is told so.
    expect(rowFor(wrapper, 'email').text()).toContain('Select a column from file')
    expect(wrapper.find('[data-testid="header-moved"]').text()).toContain('EPOSTA')

    await wrapper.find('[data-testid="undo-move"]').trigger('click')

    expect(rowFor(wrapper, 'email').text()).toContain('EPOSTA')
    expect(rowFor(wrapper, 'phone').text()).toContain('Select a column from file')
    expect(wrapper.find('[data-testid="header-moved"]').exists()).toBe(false)
  })

  it('marks a header another field is holding', async () => {
    const wrapper = mountModal()

    await wrapper.find('[data-testid="filter-all"]').trigger('click')

    const row = rowFor(wrapper, 'phone')
    await row.findAll('button')[0].trigger('click')

    const option = row.findAll('li').find((li) => li.text().startsWith('EPOSTA'))!
    expect(option.text()).toContain('already mapped to E-posta')
  })
})

describe('ColumnMappingModal unmapped columns', () => {
  it('names the columns the import would skip', async () => {
    const wrapper = mountModal()
    const panel = () => wrapper.find('[data-testid="unmapped-columns"]')

    expect(panel().text()).toContain('NOTLAR')
    expect(panel().text()).toContain('1 columns unused')

    await wrapper.find('[data-testid="filter-all"]').trigger('click')
    await selectHeader(wrapper, 'phone', 'NOTLAR')

    expect(panel().text()).toContain('Every column in the file is mapped.')
  })
})
