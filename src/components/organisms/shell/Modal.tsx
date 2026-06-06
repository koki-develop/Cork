import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode } from "react";

import { useEscapeKey } from "@/hooks/ui/useEscapeKey";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  closeAriaLabel?: string;
  containerClassName?: string;
};

export function Modal({
  isOpen,
  onClose,
  children,
  closeAriaLabel = "Close",
  containerClassName,
}: ModalProps) {
  useEscapeKey(onClose, isOpen, { respectDefaultPrevented: true });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <m.button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/60 backdrop-blur-xs"
            onClick={onClose}
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
      )}
    </AnimatePresence>
  );
}
