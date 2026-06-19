import { clsx } from "clsx";
import { useEffect, useRef } from "react";

import { isArrowDownKey, isArrowUpKey } from "@/lib/keyboard";

import type { DropdownMenuItem } from "./DropdownMenu";

export type MenuListProps = {
  items: [DropdownMenuItem, ...DropdownMenuItem[]];
  onSelect: () => void;
};

const itemColorStyles: Record<NonNullable<DropdownMenuItem["color"]>, string> = {
  default: "text-cork-text hover:bg-cork-accent/10 focus:bg-cork-accent/10",
  danger:
    "text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300",
};

const STATIC_NAV_KEYS = new Set(["Tab", "Home", "End"]);

/**
 * Renders a focus-managed menu list shared by `DropdownMenu` and `ContextMenu`.
 *
 * Initial state: no item is focused (no highlight ring, no background) — the
 * menu is just "open and waiting". The first Tab brings focus onto the first
 * item (Shift+Tab → last item). Subsequent Tab / arrow keys cycle between
 * items without leaking out. Home / End jump to the ends.
 *
 * The keyboard handler is attached to `document` in the capture phase, not as
 * a React `onKeyDown` on the menu container. Two reasons:
 *
 * 1. Because no item is focused on open, keydown events on `body` / on the
 *    page would never bubble to a React handler scoped to the menu container.
 * 2. `ContextMenu` briefly renders the menu as `visibility: hidden` during the
 *    measurement pass that flips the menu inside the viewport — descendants
 *    are not focusable while hidden, which can leave focus orphaned even if
 *    we tried to seed it. A document-level capture handler is independent of
 *    where focus actually is.
 *
 * Capture + `preventDefault` also pre-empts `Modal`'s `useFocusTrap` when the
 * menu is opened inside a modal — that trap reads `e.defaultPrevented` and
 * defers, so cycling stays scoped to the menu instead of jumping into the
 * surrounding modal's tab order.
 *
 * Focused items show a background highlight (no outline ring). Hover styles
 * are independent of focus.
 *
 * Focus restoration:
 * - Item click restores focus synchronously before running the item action,
 *   so any subsequent state change (e.g. opening another modal) captures
 *   focus from a stable anchor rather than from a soon-to-be-removed item.
 * - Escape / outside-click restore focus from the unmount cleanup, unless the
 *   user landed on an unrelated focusable element (then we respect that).
 */
export function MenuList({ items, onSelect }: MenuListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const container = containerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const downKey = isArrowDownKey(e);
      const upKey = isArrowUpKey(e);
      if (!downKey && !upKey && !STATIC_NAV_KEYS.has(e.key)) return;
      if (!container) return;
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
      if (buttons.length === 0) return;

      const active = document.activeElement;
      const focusedButton =
        active instanceof HTMLButtonElement && container.contains(active) ? active : null;
      const currentIndex = focusedButton ? buttons.indexOf(focusedButton) : -1;

      let nextIndex: number;
      if (downKey) {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
      } else if (upKey) {
        nextIndex =
          currentIndex < 0
            ? buttons.length - 1
            : (currentIndex - 1 + buttons.length) % buttons.length;
      } else {
        switch (e.key) {
          case "Tab":
            if (currentIndex < 0) {
              nextIndex = e.shiftKey ? buttons.length - 1 : 0;
            } else {
              nextIndex = e.shiftKey
                ? (currentIndex - 1 + buttons.length) % buttons.length
                : (currentIndex + 1) % buttons.length;
            }
            break;
          case "Home":
            nextIndex = 0;
            break;
          case "End":
            nextIndex = buttons.length - 1;
            break;
          default:
            return;
        }
      }
      e.preventDefault();
      buttons[nextIndex].focus();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      // Only restore focus if it's still inside (or has left) the menu we own.
      // If the user clicked a different focusable element (e.g. a form field
      // in the surrounding modal), respect that landing spot instead of
      // yanking focus back to the trigger.
      const focused = document.activeElement;
      if (
        container &&
        focused instanceof Node &&
        focused !== document.body &&
        !container.contains(focused)
      ) {
        return;
      }
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  const handleItemClick = (item: DropdownMenuItem) => {
    const prev = previousFocusRef.current;
    // Null the ref so the unmount cleanup doesn't re-restore — by then a
    // chained action (e.g. a confirm dialog) may have legitimately taken focus.
    previousFocusRef.current = null;
    if (prev instanceof HTMLElement && document.contains(prev)) {
      prev.focus();
    }
    onSelect();
    item.onClick();
  };

  return (
    <div ref={containerRef} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => handleItemClick(item)}
          className={clsx(
            "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none",
            itemColorStyles[item.color ?? "default"],
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
