import { useEffect, useRef } from 'react'

/** Matches `--dialog-close-dur` (150ms) with a little slack; only a fallback for
 *  a `transitionend` that never arrives. */
const CLOSE_FALLBACK_MS = 220

/**
 * Drives a native `<dialog>` that uses the `.dialog-motion` recipe.
 *
 * Open: `showModal()`, then `.is-open` after a forced synchronous reflow
 * (`offsetWidth`) so the browser has a committed starting state to transition
 * from (200ms, opacity + scale + backdrop).
 * Close: `.is-closing`, then the real `dialog.close()` once the transition ends
 * (150ms, faster than the open), with a timeout fallback. With reduced motion
 * there is nothing to wait for, so it closes immediately.
 *
 * Also keeps React state in step when the user agent closes the dialog itself,
 * and turns a native `cancel` (Escape) into a state change so the exit plays.
 */
export function useDialogMotion(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onCloseRef.current()
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [dialogRef])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      // showModal() throws if already open, so only the closed case opens.
      if (!dialog.open) {
        dialog.classList.remove('is-open')
        dialog.showModal()
      }
      dialog.classList.remove('is-closing')
      void dialog.offsetWidth // commit the closed state before animating to open
      dialog.classList.add('is-open')
      return
    }

    // close() on a closed dialog fires a spurious 'close' event; guard it.
    if (!dialog.open) return

    const finish = () => {
      dialog.classList.remove('is-open', 'is-closing')
      if (dialog.open) dialog.close()
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }

    const onEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === 'opacity' && event.pseudoElement === '') finish()
    }
    dialog.classList.remove('is-open')
    dialog.classList.add('is-closing')
    dialog.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS)
    return () => {
      // Reopened mid-exit (or unmounted): abandon this close.
      window.clearTimeout(timer)
      dialog.removeEventListener('transitionend', onEnd)
    }
  }, [dialogRef, open])
}
