import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  closeAriaLabel?: string;
  containerClassName?: string;
  /** Set true while a nested modal is open above this one. Native <dialog>
   *  stacks each showModal() call in the top layer but does NOT auto-inert
   *  the dialogs underneath — without this flag, Tab can leak focus to the
   *  buried dialog's controls. */
  inert?: boolean;
};

export function Modal({
  isOpen,
  onClose,
  children,
  closeAriaLabel = "Close",
  containerClassName,
  inert,
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <ModalDialog
          onClose={onClose}
          closeAriaLabel={closeAriaLabel}
          containerClassName={containerClassName}
          inert={inert}
        >
          {children}
        </ModalDialog>
      )}
    </AnimatePresence>
  );
}

type ModalDialogProps = {
  onClose: () => void;
  children: ReactNode;
  closeAriaLabel: string;
  containerClassName?: string;
  inert?: boolean;
};

function ModalDialog({
  onClose,
  children,
  closeAriaLabel,
  containerClassName,
  inert,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() gives us focus trap, background inert-ification, and top-layer
  // rendering for free. close() runs on unmount, which AnimatePresence delays
  // until the exit animation finishes — so the dialog stays in the top layer
  // while the inner motion elements animate out.
  //
  // For initial focus we override the browser's default (which lands on the
  // first sequentially-focusable child — typically the header close button):
  //   - [data-autofocus] marked element wins. We use this instead of React's
  //     autoFocus prop because that prop is a client-side polyfill that calls
  //     .focus() during commit, but the <dialog> is still display:none at that
  //     moment (UA stylesheet for unopened dialogs) so the focus is dropped.
  //   - Otherwise we focus the dialog itself so no button gets a stray focus
  //     ring on open. The focus trap still works — Tab moves into the content.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const autofocusTarget = dialog.querySelector<HTMLElement>("[data-autofocus]");
    if (autofocusTarget) {
      autofocusTarget.focus();
    } else {
      dialog.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      inert={inert}
      onCancel={(e) => {
        // Escape pressed: stop the browser from closing the dialog immediately
        // so AnimatePresence can run the exit animation before close() fires.
        e.preventDefault();
        // If a floating popup (e.g. Select dropdown) is open, let the child
        // component handle Escape instead of closing the dialog.
        if (document.querySelector('[data-floating-popup="true"]')) return;
        onClose();
      }}
      className="text-cork-text fixed inset-0 z-50 m-0 flex h-screen max-h-none w-screen max-w-none items-center justify-center border-0 bg-transparent p-0 outline-none backdrop:bg-transparent"
    >
      <m.button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
        // Keep focus on the active field so its blur-driven save handler
        // doesn't race the close click.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={closeAriaLabel}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
      <m.div
        className={clsx(
          "border-cork-border/60 bg-cork-surface/95 relative mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border p-6 shadow-2xl backdrop-blur-xl",
          containerClassName,
        )}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </m.div>
    </dialog>
  );
}
