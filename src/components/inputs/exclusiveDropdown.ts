import { computed, onUnmounted, ref, type ComputedRef } from 'vue'

/**
 * The one dropdown allowed to be open, shared by every consumer of the
 * composable below.
 *
 * Outside-click handling alone cannot carry this guarantee: it depends on the
 * click reaching `document`, which any ancestor in the host application can
 * cancel with a single `@click.stop` — and when it does, every row's dropdown
 * stays open and the panels stack on top of each other. Ownership of "who is
 * open" therefore lives here, above the individual instances.
 */
const activeId = ref<symbol | null>(null)

export interface ExclusiveDropdown {
  /** Whether this instance is the one currently open. */
  isOpen: ComputedRef<boolean>
  /** Open this instance, closing whichever other one was open. */
  open: () => void
  /** Close this instance (no-op if another one is open). */
  close: () => void
  /** Open this instance, or close it if it is already the open one. */
  toggle: () => void
}

/**
 * Claim membership in the single-open dropdown group.
 *
 * Closes itself on unmount so a removed row cannot keep the group occupied.
 *
 * @return Open state plus the transitions that mutate it
 */
export function useExclusiveDropdown(): ExclusiveDropdown {
  const id = Symbol('exclusive-dropdown')

  const isOpen = computed(() => activeId.value === id)

  const open = () => {
    activeId.value = id
  }

  const close = () => {
    if (activeId.value === id) activeId.value = null
  }

  const toggle = () => {
    if (isOpen.value) close()
    else open()
  }

  onUnmounted(close)

  return { isOpen, open, close, toggle }
}
