import { clsx } from "clsx";
import { type ReactNode, useEffect } from "react";

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
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
        onClick={onClose}
        aria-label={closeAriaLabel}
      />
      <div
        className={clsx(
          "relative w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border border-cork-border/60 bg-cork-surface/95 backdrop-blur-xl p-6 shadow-2xl",
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
