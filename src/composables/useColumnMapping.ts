/**
 * State behind the column-mapping editor.
 *
 * The editor is field-oriented: one row per importable target field, each
 * pointing at a file header. The session's own column mappings only cover the
 * headers the uploaded file happens to carry, so on their own they can neither
 * offer a field the file does not mention nor let the user map one by hand —
 * hence the field catalogue, which this composable folds together with the
 * mappings into one row list.
 *
 * Everything derived lives here rather than in the component so it can be
 * exercised without mounting, and so the component stays a rendering of it.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { SelectOption } from '../components/inputs/SelectInput.vue'
import { scoreColumnMatch } from '../utils/columnMatch.js'
import { foldText } from '../utils/i18n.js'
import type { APIImportField, APIImportMapping, MappingColumnUpdate } from '../types.js'

/** Backend confidence at or above which a proposal is treated as settled. */
const AUTO_CONFIRM_THRESHOLD = 0.8

/** Section key standing for "belongs to no repeating section". */
export const FLAT_SECTION = ''

/** One row of the editor: a target field and what it is currently mapped to. */
export interface MappingRowModel {
  target: string
  label: string
  required: boolean
  group: string | null
  groupLabel: string | null
  groupIndex: number | null
  groupField: string | null
  aliases: string[]
  /** Whether this session (or an applied template) proposed a column for the field. */
  proposed: boolean
  proposedColumn: string | null
  proposedScore: number
  /** The column the row starts out with, once prefill rules are applied. */
  prefill: string | null
}

/** One slot of a repeating section, e.g. the third job of a work history. */
export interface MappingSlot {
  index: number
  rows: MappingRowModel[]
}

/** A rendered section: the flat fields, or one repeating group. */
export interface MappingSection {
  key: string
  label: string | null
  collapsible: boolean
  /** Rows surviving the current search/filter, in row order. */
  rows: MappingRowModel[]
  /** The same rows grouped per slot; a single slot for the flat section. */
  slots: MappingSlot[]
  /** Distinct slots of the whole section, regardless of the current filter. */
  slotCount: number
  /** Mapped rows of the whole section, regardless of the current filter. */
  mappedCount: number
  requiredUnmappedCount: number
}

/** What the editor shows the user when a header changes owner. */
export interface HeaderMove {
  header: string
  from: string
  to: string
}

export interface UseColumnMappingOptions {
  mappings: () => APIImportMapping[]
  fields: () => APIImportField[]
  detectedHeaders: () => string[]
  /** Resolves a target field's display label through the host's i18n. */
  label: (field: string, fallback: string) => string
  /** Resolves a repeating section's label through the host's i18n. */
  sectionLabel: (group: string, fallback: string) => string
}

/**
 * Builds the editor's rows, filters, scores and save payload.
 *
 * @param options Accessors for the props the editor renders from, plus the two
 *                label resolvers (the host owns translation)
 * @return The reactive surface the mapping modal renders
 */
export function useColumnMapping(options: UseColumnMappingOptions) {
  const { mappings, fields, detectedHeaders, label, sectionLabel } = options

  /** Target field => selected file header. */
  const localMappings = ref<Record<string, string | null>>({})
  const search = ref('')
  const filterMode = ref<'relevant' | 'all'>('relevant')
  const expandedGroups = ref<Record<string, boolean>>({})
  const lastMove = ref<HeaderMove | null>(null)

  /**
   * The best proposal per target field.
   *
   * The backend scores every header independently, so two columns can win the
   * same target; only one of them can keep it (a mapping is keyed by column, and
   * the import keeps one column per target), so the strongest one does.
   */
  const proposalByTarget = computed(() => {
    const byTarget = new Map<string, APIImportMapping>()

    for (const mapping of mappings()) {
      if (!mapping.target_field) continue

      const existing = byTarget.get(mapping.target_field)
      if (!existing) {
        byTarget.set(mapping.target_field, mapping)
        continue
      }

      if (mapping.is_confirmed && !existing.is_confirmed) {
        byTarget.set(mapping.target_field, mapping)
      } else if (
        mapping.is_confirmed === existing.is_confirmed &&
        mapping.confidence_score > existing.confidence_score
      ) {
        byTarget.set(mapping.target_field, mapping)
      }
    }

    return byTarget
  })

  /**
   * Backend confidence per (source column, target field) pair.
   *
   * The session carries one mapping per detected header, so the score the
   * backend computed is recoverable for any pair it looked at — not only for the
   * column it ended up choosing.
   */
  const backendScores = computed(() => {
    const byPair = new Map<string, number>()

    for (const mapping of mappings()) {
      if (!mapping.target_field || !mapping.source_column) continue
      byPair.set(pairKey(mapping.source_column, mapping.target_field), mapping.confidence_score)
    }

    return byPair
  })

  /**
   * Every row the editor can show: the catalogue, plus any target the session
   * maps that the catalogue does not describe.
   *
   * The trailing group means a mapping the backend already has can never
   * disappear from the editor — a stale template target, or a field that left
   * the catalogue since the session was created, still shows up (and can still
   * be cleared) instead of being silently imported.
   */
  const rows: ComputedRef<MappingRowModel[]> = computed(() => {
    const catalogue = fields()
    const built: MappingRowModel[] = []
    const seen = new Set<string>()

    for (const field of catalogue) {
      built.push(toRow(field))
      seen.add(field.field)
    }

    for (const target of proposalByTarget.value.keys()) {
      if (seen.has(target)) continue
      built.push(
        toRow({
          field: target,
          label: target,
          required: proposalByTarget.value.get(target)?.is_required ?? false,
          type: 'string',
          aliases: [],
          group: null,
          group_label: null,
          group_index: null,
          group_field: null,
        }),
      )
      seen.add(target)
    }

    return sortRows(built)
  })

  /**
   * Rows surviving the search box and the scope toggle.
   *
   * A search spans the whole catalogue, scope be damned: typing a field's name
   * is how the user asks for a field the default scope hides, so honouring the
   * scope here would hide most of what they searched for.
   */
  const visibleRows = computed(() => {
    const query = foldText(search.value.trim())

    if (query !== '') {
      return rows.value.filter((row) => searchKeys(row).some((key) => foldText(key).includes(query)))
    }

    return rows.value.filter((row) => filterMode.value === 'all' || isRelevant(row))
  })

  const sections: ComputedRef<MappingSection[]> = computed(() => {
    const visibleByGroup = groupBy(visibleRows.value)
    const allByGroup = groupBy(rows.value)
    const built: MappingSection[] = []

    for (const [key, groupRows] of allByGroup) {
      const visible = visibleByGroup.get(key) ?? []
      const flat = key === FLAT_SECTION

      built.push({
        key,
        label: flat ? null : sectionLabel(key, groupRows[0]?.groupLabel ?? key),
        collapsible: !flat,
        rows: visible,
        slots: flat ? [{ index: 0, rows: visible }] : toSlots(visible),
        slotCount: flat ? 1 : new Set(groupRows.map((row) => row.groupIndex)).size,
        mappedCount: groupRows.filter((row) => !!localMappings.value[row.target]).length,
        requiredUnmappedCount: groupRows.filter(
          (row) => row.required && !localMappings.value[row.target],
        ).length,
      })
    }

    return built
  })

  const mappedCount = computed(
    () => rows.value.filter((row) => !!localMappings.value[row.target]).length,
  )

  const requiredUnmappedCount = computed(
    () => rows.value.filter((row) => row.required && !localMappings.value[row.target]).length,
  )

  const allRequiredMapped = computed(() => requiredUnmappedCount.value === 0)

  /** File headers offered in every row's picker, de-duplicated in file order. */
  const headerOptions: ComputedRef<SelectOption[]> = computed(() => {
    const options: SelectOption[] = []
    const seen = new Set<string>()

    for (const header of detectedHeaders()) {
      // A blank header cannot be addressed and a repeated one is read only once,
      // so neither can carry a mapping the import would honour.
      if (!header || seen.has(header)) continue
      seen.add(header)
      options.push({ value: header, label: header })
    }

    return options
  })

  /** Header => label of the field currently holding it. */
  const takenBy = computed(() => {
    const owners: Record<string, string> = {}

    for (const row of rows.value) {
      const header = localMappings.value[row.target]
      if (header) owners[header] = row.label
    }

    return owners
  })

  /** Headers no field is mapped to, i.e. the columns the import will skip. */
  const unmappedHeaders = computed(() =>
    headerOptions.value.map((option) => option.value).filter((header) => !takenBy.value[header]),
  )

  /** Match score of what is currently selected, per target field. */
  const scores = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}

    for (const row of rows.value) {
      const selected = localMappings.value[row.target]
      if (!selected) {
        result[row.target] = 0
        continue
      }

      // The backend knows the field's aliases and has already scored the pairs it
      // looked at; anything the user picks since is scored with the same formula.
      const known = backendScores.value.get(pairKey(selected, row.target))
      result[row.target] =
        known ??
        scoreColumnMatch(selected, row.target, { label: row.label, aliases: row.aliases }).score
    }

    return result
  })

  /**
   * Whether a section is open.
   *
   * A search spans the whole catalogue, so its hits are shown wherever they
   * live; the user's own toggles are kept aside and resume once the box is
   * cleared.
   *
   * @param key Section key
   */
  function isExpanded(key: string): boolean {
    if (key === FLAT_SECTION) return true
    if (search.value.trim() !== '') return true

    return expandedGroups.value[key] ?? false
  }

  /**
   * Opens a collapsed section, or collapses an open one.
   *
   * @param key Section key
   */
  function toggleGroup(key: string): void {
    expandedGroups.value = { ...expandedGroups.value, [key]: !isExpanded(key) }
  }

  /**
   * Points a target field at a file header, taking the header off its previous
   * owner.
   *
   * A column can only feed one target — the mapping is keyed by column — so two
   * fields claiming one header is not a state the backend can store. Moving it
   * beats rejecting the pick: in a list of a couple of hundred fields, making
   * the user find and clear the previous owner first would be a dead end.
   *
   * @param target Target field being mapped
   * @param header File header to map onto it, or null to clear the row
   */
  function assignHeader(target: string, header: string | null): void {
    const next = header || null
    lastMove.value = null

    if (next) {
      const previous = rows.value.find(
        (row) => row.target !== target && localMappings.value[row.target] === next,
      )

      if (previous) {
        localMappings.value[previous.target] = null
        lastMove.value = { header: next, from: previous.target, to: target }
      }
    }

    localMappings.value[target] = next
  }

  /** Puts a moved header back where it was, and clears the notice. */
  function undoMove(): void {
    const move = lastMove.value
    if (!move) return

    localMappings.value[move.to] = null
    localMappings.value[move.from] = move.header
    lastMove.value = null
  }

  /**
   * Brings the missing required fields into view.
   *
   * They can be hidden behind either control — a search that does not match
   * them, or a collapsed section — so both are cleared, and every section
   * holding one is opened.
   */
  function revealRequiredUnmapped(): void {
    search.value = ''
    filterMode.value = 'relevant'

    const expanded = { ...expandedGroups.value }
    for (const row of rows.value) {
      if (row.required && !localMappings.value[row.target] && row.group) {
        expanded[row.group] = true
      }
    }
    expandedGroups.value = expanded
  }

  /**
   * Seeds the selections from the session, and the sections' open state from
   * what those selections touch.
   *
   * Called on open and whenever the mappings change (applying a template
   * rewrites them, and the template has to win over what the user had picked).
   */
  function buildLocalMappings(): void {
    const selected: Record<string, string | null> = {}
    const claimed = new Set<string>()

    for (const row of rows.value) {
      const column = row.prefill

      // Prefills come from mappings keyed by column, so a clash is not expected;
      // it is still guarded, since a lossy save is worse than a missing prefill.
      if (column && !claimed.has(column)) {
        claimed.add(column)
        selected[row.target] = column
      } else {
        selected[row.target] = null
      }
    }

    localMappings.value = selected
    lastMove.value = null

    const expanded: Record<string, boolean> = {}
    for (const row of rows.value) {
      if (!row.group) continue
      if (selected[row.target] || row.required) expanded[row.group] = true
    }
    expandedGroups.value = expanded
  }

  /**
   * The save payload: what to map, and what to stop mapping.
   *
   * The columns the user left alone matter as much as the ones they picked. A
   * column the backend auto-confirmed keeps importing until something says
   * otherwise, so every column that lost its target is sent back explicitly
   * cleared. Entries are keyed by column, which is also the guarantee that the
   * payload can never hold two rows for the same one.
   *
   * @return The target=>header map the legacy `start` argument carries, and the
   *         column updates to persist
   */
  function buildStartPayload(): {
    mappings: Record<string, string>
    columns: MappingColumnUpdate[]
  } {
    const selected: Record<string, string> = {}
    const columns = new Map<string, MappingColumnUpdate>()

    for (const row of rows.value) {
      const header = localMappings.value[row.target]
      if (!header) continue

      selected[row.target] = header
      columns.set(header, { source_column: header, target_field: row.target, confirmed: true })
    }

    for (const mapping of mappings()) {
      if (!mapping.source_column || columns.has(mapping.source_column)) continue
      // Already blank on the backend: nothing to clear.
      if (!mapping.target_field && !mapping.is_confirmed) continue

      columns.set(mapping.source_column, {
        source_column: mapping.source_column,
        target_field: null,
        confirmed: false,
      })
    }

    return { mappings: selected, columns: [...columns.values()] }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Expands a catalogue entry into a row, including its proposal and prefill.
   *
   * @param field The catalogue entry
   */
  function toRow(field: APIImportField): MappingRowModel {
    const proposal = proposalByTarget.value.get(field.field)
    const settled =
      !!proposal && (proposal.is_confirmed || proposal.confidence_score >= AUTO_CONFIRM_THRESHOLD)

    return {
      target: field.field,
      label: label(field.field, field.label || field.field),
      required: field.required || proposal?.is_required || false,
      group: field.group,
      groupLabel: field.group_label,
      groupIndex: field.group_index,
      groupField: field.group_field,
      aliases: field.aliases ?? [],
      proposed: !!proposal,
      proposedColumn: proposal?.source_column ?? null,
      proposedScore: proposal?.confidence_score ?? 0,
      prefill: settled ? proposal.source_column || null : null,
    }
  }

  /**
   * Whether a row survives the default filter.
   *
   * A catalogue can run to a couple of hundred targets, most of them empty slots
   * of a repeating section. What the user came to look at is what the file
   * touched and what the import demands; the rest is one toggle away.
   *
   * @param row The row to test
   */
  function isRelevant(row: MappingRowModel): boolean {
    return !!localMappings.value[row.target] || row.required || row.proposed
  }

  /**
   * The strings a search matches a row against.
   *
   * @param row The row to test
   */
  function searchKeys(row: MappingRowModel): string[] {
    const keys = [row.label, row.target, ...row.aliases]

    if (row.groupLabel) keys.push(row.groupLabel)

    const selected = localMappings.value[row.target]
    if (selected) keys.push(selected)

    return keys
  }

  /**
   * Orders rows: flat fields first, then each section, slot by slot.
   *
   * @param unsorted Rows in catalogue order
   */
  function sortRows(unsorted: MappingRowModel[]): MappingRowModel[] {
    const flat: MappingRowModel[] = []
    const groups = new Map<string, MappingRowModel[]>()

    for (const row of unsorted) {
      if (!row.group) {
        flat.push(row)
        continue
      }

      const bucket = groups.get(row.group)
      if (bucket) {
        bucket.push(row)
      } else {
        groups.set(row.group, [row])
      }
    }

    const ordered = [...flat]
    for (const bucket of groups.values()) {
      ordered.push(
        ...[...bucket].sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)),
      )
    }

    return ordered
  }

  /**
   * Buckets rows by section, preserving row order.
   *
   * @param source Rows to bucket
   */
  function groupBy(source: MappingRowModel[]): Map<string, MappingRowModel[]> {
    const byGroup = new Map<string, MappingRowModel[]>()

    for (const row of source) {
      const key = row.group ?? FLAT_SECTION
      const bucket = byGroup.get(key)
      if (bucket) {
        bucket.push(row)
      } else {
        byGroup.set(key, [row])
      }
    }

    return byGroup
  }

  /**
   * Splits a section's rows into its slots.
   *
   * @param source Rows of one section, already in slot order
   */
  function toSlots(source: MappingRowModel[]): MappingSlot[] {
    const slots: MappingSlot[] = []

    for (const row of source) {
      const index = row.groupIndex ?? 0
      const last = slots[slots.length - 1]

      if (last && last.index === index) {
        last.rows.push(row)
      } else {
        slots.push({ index, rows: [row] })
      }
    }

    return slots
  }

  return {
    localMappings: localMappings as Ref<Record<string, string | null>>,
    rows,
    visibleRows,
    sections,
    mappedCount,
    requiredUnmappedCount,
    allRequiredMapped,
    scores,
    search,
    filterMode,
    expandedGroups,
    isExpanded,
    toggleGroup,
    headerOptions,
    takenBy,
    unmappedHeaders,
    lastMove,
    assignHeader,
    undoMove,
    revealRequiredUnmapped,
    buildLocalMappings,
    buildStartPayload,
  }
}

/**
 * Composite key for the score lookup.
 *
 * The unit separator cannot occur in a spreadsheet header or a field key, so no
 * pair of values can collide on it.
 *
 * @param sourceColumn File header
 * @param targetField  Target field key
 * @return The map key for that pair
 */
function pairKey(sourceColumn: string, targetField: string): string {
  return `${sourceColumn}\u001f${targetField}`
}
