import { useEffect, useRef, useState } from 'react'
import { CloseIcon, DownloadIcon } from './Icons'
import { useDialogMotion } from '../lib/useDialogMotion'
import { ActionLink, IconButton } from './Ui'

/** Served straight out of the web root; the one place contact details live. */
export const RESUME_PDF = '/trevor_huval_resume.pdf'

/**
 * The résumé PDF in a modal, so a visitor can read it without leaving the page
 * or opening a tab. Same native `<dialog>` + `showModal()` foundation as the
 * photo lightbox: focus trap, Escape, focus return and the inert background all
 * come from the platform.
 *
 * The document itself is the browser's own PDF viewer in an iframe. The
 * `#toolbar=0` fragment asks Chromium/Firefox to drop their toolbar so the
 * page's own chrome is the only chrome; viewers that ignore it just show
 * theirs, which is harmless. On phones the built-in viewer is unreliable, so
 * the download link in the bar stays the guaranteed path.
 */
export default function ResumeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialogMotion(dialogRef, open, onClose)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Nothing is mounted until it first opens, so the PDF is never fetched for a
  // visitor who never asks for it. After that it stays mounted so the exit
  // animation has something to fade (and reopening is instant).
  const [everOpened, setEverOpened] = useState(open)
  if (open && !everOpened) setEverOpened(true)

  return (
    <dialog
      ref={dialogRef}
      aria-label="Resume"
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      className="dialog dialog-motion"
    >
      {everOpened && (
        <div className="pointer-events-none flex h-full w-full items-center justify-center">
          {/* Letter-page proportions capped to the viewport: on a wide screen
              the frame is a sheet of paper, not a slab. */}
          <div
            className="pointer-events-auto flex h-full w-full max-w-[52rem] flex-col gap-3"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <div className="resume-bar">
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta font-medium text-ink">Trevor Huval — Resume</p>
                <p className="gutter-date mt-0.5 truncate">PDF · one page</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ActionLink href={RESUME_PDF} download variant="primary">
                  <DownloadIcon className="size-4" />
                  Download
                </ActionLink>
                <IconButton label="Close" onClick={onClose}>
                  <CloseIcon className="size-[1.15rem]" />
                </IconButton>
              </div>
            </div>

            <div className="resume-frame">
              <iframe
                src={`${RESUME_PDF}#toolbar=0&navpanes=0&view=FitH`}
                title="Trevor Huval resume, PDF"
                className="h-full w-full rounded-[var(--r-md)] bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
