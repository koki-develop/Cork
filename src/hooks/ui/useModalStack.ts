import { useEffect, useState } from "react";

type StackEntry = { setIsTop: (value: boolean) => void };

const stack: StackEntry[] = [];

function notifyAll() {
  for (let i = 0; i < stack.length; i++) {
    stack[i].setIsTop(i === stack.length - 1);
  }
}

/**
 * Tracks whether this modal sits at the top of the global modal stack.
 *
 * Each call pushes an entry on mount and pops on unmount. Only the top entry
 * returns `true`; lower entries flip back to `true` automatically as modals
 * above them close. Independently-rooted modals (e.g. a task detail dialog
 * and a settings dialog opened on top of it via `Cmd+,`) cooperate without
 * any prop drilling — the lower modal goes inert as soon as the upper one
 * mounts.
 *
 * Registration is tied to mount/unmount, not to `isOpen`, so the entry stays
 * on top throughout its own exit animation. That keeps a rapid double-Escape
 * from leaking into the modal underneath while the closing one is still
 * fading out.
 */
export function useIsTopOfModalStack(): boolean {
  const [isTop, setIsTop] = useState(true);

  useEffect(() => {
    const entry: StackEntry = { setIsTop };
    stack.push(entry);
    notifyAll();
    return () => {
      const idx = stack.indexOf(entry);
      if (idx !== -1) stack.splice(idx, 1);
      notifyAll();
    };
  }, []);

  return isTop;
}
