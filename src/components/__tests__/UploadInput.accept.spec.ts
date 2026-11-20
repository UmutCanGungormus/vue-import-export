import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UploadInput from '../UploadInput.vue'

/** Spreadsheet uploads are accepted by extension: browsers report CSV MIME types inconsistently. */
async function pick(accept: string, file: File) {
  const w = mount(UploadInput, { props: { accept, modelValue: null } })
  const input = w.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  return w.emitted('update:modelValue')?.[0]?.[0]
}

describe('UploadInput accept', () => {
  it('accepts a CSV whose MIME type is empty or vnd.ms-excel', async () => {
    expect(await pick('.xlsx,.xls,.csv', new File(['a;b'], 'veri.csv', { type: '' }))).toBeInstanceOf(File)
    expect(await pick('.xlsx,.xls,.csv', new File(['a;b'], 'veri.csv', { type: 'application/vnd.ms-excel' }))).toBeInstanceOf(File)
  })

  it('rejects a file outside the accept list', async () => {
    expect(await pick('.xlsx,.xls,.csv', new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))).toBeUndefined()
  })
})
