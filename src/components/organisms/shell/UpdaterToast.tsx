import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { UpdaterState } from "@/types";

// Bridges `useUpdater`'s state machine to sonner. Renders nothing. The toast
// lives in the global `<Toaster>` stack, so it shares position, animation,
// stacking, and theming with every other Cork toast (no offset hack, no
// custom z-index management).
//
// State → sonner mapping (`id` is stable so successive calls update the same
// toast in place):
//   available   → toast()        with an action button
//   downloading → toast.loading() with a custom progress description
//   installing  → toast.loading() with a "restarting" description
//   error       → toast.error()
//   idle/checking → toast.dismiss()  (no surfaced UI)
const TOAST_ID = "cork-updater-notification";

const RELEASES_URL = "https://github.com/koki-develop/Cork/releases/tag";

export type UpdaterToastProps = {
  state: UpdaterState;
  onInstall: () => void;
  onDismiss: () => void;
  onOpenReleaseNotes: (url: string) => void;
};

export function UpdaterToast({
  state,
  onInstall,
  onDismiss,
  onOpenReleaseNotes,
}: UpdaterToastProps) {
  // Track the previous render's kind so we only call `toast.dismiss` when a
  // visible toast actually exists. Calling `toast.dismiss(id)` on mount (when
  // no toast has been created) schedules a stale `dismiss: true` event via
  // sonner's internal `requestAnimationFrame` (state.ts:91), which then
  // arrives AFTER the next `toast(msg, {id})` adds the same-id toast — sonner
  // matches by id and immediately marks our just-created toast `delete: true`,
  // playing the exit animation. The toast "peeks then slides away".
  const prevKindRef = useRef<UpdaterState["kind"]>(state.kind);

  useEffect(() => {
    const prevKind = prevKindRef.current;
    prevKindRef.current = state.kind;

    // `checking` is a transient state — never touch the toast for it. Any
    // previously visible toast keeps showing until the next visible state
    // arrives (or until the user dismisses it via X).
    if (state.kind === "checking") return;

    if (state.kind === "idle") {
      // Only dismiss if a visible toast was actually showing in the prior
      // render. Skipping when prev was `idle`/`checking` avoids the stale-RAF
      // race described above.
      if (
        prevKind === "available" ||
        prevKind === "downloading" ||
        prevKind === "installing" ||
        prevKind === "error"
      ) {
        toast.dismiss(TOAST_ID);
      }
      return;
    }

    switch (state.kind) {
      case "available": {
        const version = state.version;
        toast(`Cork ${version} is available`, {
          id: TOAST_ID,
          description: (
            <ReleaseNotesLink onClick={() => onOpenReleaseNotes(`${RELEASES_URL}/v${version}`)} />
          ),
          action: {
            label: "Install and Restart",
            // sonner auto-dismisses the toast after the action click unless
            // we `preventDefault` (index.tsx:495). We want the same toast to
            // transition into the downloading/installing UI, so block the
            // default dismiss and let `installAndRestart()` drive the state
            // change — the next render reuses the same id and updates the
            // toast in place.
            onClick: (event) => {
              event.preventDefault();
              onInstall();
            },
          },
          duration: Number.POSITIVE_INFINITY,
          dismissible: true,
          closeButton: true,
          // Sync sonner's manual close (X / swipe) back to the state machine
          // so a subsequent manual check doesn't see a stale `available`.
          onDismiss: onDismiss,
        });
        break;
      }
      case "downloading":
        toast.loading(`Downloading Cork ${state.version}`, {
          id: TOAST_ID,
          description: (
            <DownloadProgress downloaded={state.downloaded} contentLength={state.contentLength} />
          ),
          // sonner's `create()` merges options as `{...prevToast, ...newData}`
          // — fields we don't explicitly include here would be inherited from
          // the prior `available` state's call (action button, close button,
          // onDismiss). Reset them explicitly so the downloading UI is clean.
          action: undefined,
          duration: Number.POSITIVE_INFINITY,
          dismissible: false,
          closeButton: false,
          onDismiss: undefined,
        });
        break;
      case "installing":
        toast.loading(`Downloading Cork ${state.version}`, {
          id: TOAST_ID,
          description: <span className="text-cork-muted text-[11px]">Restarting shortly…</span>,
          action: undefined,
          duration: Number.POSITIVE_INFINITY,
          dismissible: false,
          closeButton: false,
          onDismiss: undefined,
        });
        break;
      case "error":
        toast.error("Update failed", {
          id: TOAST_ID,
          description: state.message,
          action: undefined,
          duration: Number.POSITIVE_INFINITY,
          dismissible: true,
          closeButton: true,
          onDismiss: onDismiss,
        });
        break;
    }
  }, [state, onInstall, onDismiss, onOpenReleaseNotes]);

  return null;
}

function ReleaseNotesLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-cork-accent inline-flex cursor-pointer items-center gap-1 hover:underline"
    >
      Release notes
      <ExternalLink className="size-3" />
    </button>
  );
}

function DownloadProgress({
  downloaded,
  contentLength,
}: {
  downloaded: number;
  contentLength: number | null;
}) {
  // Always render the determinate bar (single `<div>`, width 0% by default).
  // Earlier this branched between an indeterminate `w-1/3 animate-pulse` div
  // and a determinate width-driven div; React reconciled them as the same
  // element and the `transition-[width]` class animated the width change
  // from 33% to 0% — making the bar appear pre-filled at first paint, then
  // visibly "reset" to zero. The sonner loading toast already provides a
  // spinner so the in-progress signal isn't lost.
  const totalKnown = contentLength !== null && contentLength > 0;
  const percent = totalKnown ? Math.min(100, (downloaded / contentLength) * 100) : 0;
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="bg-cork-elevated/60 h-1 overflow-hidden rounded-full">
        <div
          className="bg-cork-accent h-full transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-cork-muted text-[11px] tabular-nums">
        {totalKnown
          ? `${formatBytes(downloaded)} / ${formatBytes(contentLength)} · ${Math.floor(percent)}%`
          : formatBytes(downloaded)}
      </span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
