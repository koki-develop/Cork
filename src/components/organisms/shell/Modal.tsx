import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

import { useEscapeKey } from "@/hooks/ui/useEscapeKey";
import { useFocusTrap } from "@/hooks/ui/useFocusTrap";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  closeAriaLabel?: string;
  containerClassName?: string;
  /** Set true while a nested modal is open above this one. Disables this
   *  modal's focus trap, Escape handler, and pointer interaction so the
   *  nested modal owns input. */
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
        <ModalContainer
          onClose={onClose}
          closeAriaLabel={closeAriaLabel}
          containerClassName={containerClassName}
          inert={inert}
        >
          {children}
        </ModalContainer>
      )}
    </AnimatePresence>
  );
}

type ModalContainerProps = {
  onClose: () => void;
  children: ReactNode;
  closeAriaLabel: string;
  containerClassName?: string;
  inert?: boolean;
};

function ModalContainer({
  onClose,
  children,
  closeAriaLabel,
  containerClassName,
  inert,
}: ModalContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, !inert);
  useEscapeKey(() => {
    // If a floating popup (e.g. Select dropdown) is open, let the child
    // component handle Escape instead of closing the modal.
    if (document.querySelector('[data-floating-popup="true"]')) return;
    onClose();
  }, !inert);

  // For initial focus we override the browser's default (which would land on
  // the first focusable child — typically the header close button):
  //   - [data-autofocus] marked element wins.
  //   - Otherwise we focus the container itself so no button gets a stray
  //     focus ring on open. The focus trap still works — Tab moves into the
  //     content.
  // On unmount we restore focus to whichever element was focused before the
  // modal opened — native `<dialog>.close()` did this for free.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement;
    const autofocusTarget = container.querySelector<HTMLElement>("[data-autofocus]");
    if (autofocusTarget) {
      autofocusTarget.focus();
    } else {
      container.focus();
    }
    return () => {
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      inert={inert}
      className="text-cork-text fixed inset-0 z-50 flex h-screen w-screen items-center justify-center outline-none"
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
    </div>
  );
}
