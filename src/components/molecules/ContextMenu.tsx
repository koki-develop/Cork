import { AnimatePresence, m } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { useEscapeKey } from "@/hooks/ui/useEscapeKey";

import type { DropdownMenuItem } from "./DropdownMenu";
import { MenuList } from "./MenuList";

export type ContextMenuProps = {
  items: [DropdownMenuItem, ...DropdownMenuItem[]];
  position: { x: number; y: number } | null;
  onClose: () => void;
};

type Placement = {
  x: number;
  y: number;
  originX: "left" | "right";
  originY: "top" | "bottom";
};

type ResolvedPlacement = {
  forX: number;
  forY: number;
  placement: Placement;
};

const VIEWPORT_MARGIN = 8;

function computePlacement(
  desired: { x: number; y: number },
  size: { width: number; height: number },
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = desired.x;
  let originX: "left" | "right" = "left";
  if (x + size.width > vw - VIEWPORT_MARGIN) {
    x = desired.x - size.width;
    originX = "right";
  }
  x = Math.max(VIEWPORT_MARGIN, Math.min(x, vw - VIEWPORT_MARGIN - size.width));

  let y = desired.y;
  let originY: "top" | "bottom" = "top";
  if (y + size.height > vh - VIEWPORT_MARGIN) {
    y = desired.y - size.height;
    originY = "bottom";
  }
  y = Math.max(VIEWPORT_MARGIN, Math.min(y, vh - VIEWPORT_MARGIN - size.height));

  return { x, y, originX, originY };
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<ResolvedPlacement | null>(null);
  const open = position !== null;

  useClickOutside([wrapperRef], onClose, open, { primaryButtonOnly: true });
  useEscapeKey(onClose, open);

  useLayoutEffect(() => {
    if (!position) {
      setResolved(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setResolved({
      forX: position.x,
      forY: position.y,
      placement: computePlacement(position, { width: rect.width, height: rect.height }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on primitives so a fresh `position` object identity with the same coordinates doesn't re-measure.
  }, [position?.x, position?.y]);

  const placement =
    resolved && position && resolved.forX === position.x && resolved.forY === position.y
      ? resolved.placement
      : null;

  return (
    <div ref={wrapperRef} className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {position && (
          <m.div
            ref={menuRef}
            key={`${position.x}-${position.y}`}
            data-floating-popup="true"
            className="border-cork-border/40 bg-cork-elevated pointer-events-auto fixed z-50 w-max overflow-hidden rounded-lg border shadow-xl"
            style={{
              left: placement?.x ?? position.x,
              top: placement?.y ?? position.y,
              transformOrigin: placement ? `${placement.originY} ${placement.originX}` : "top left",
              visibility: placement ? "visible" : "hidden",
            }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <MenuList items={items} onSelect={onClose} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
