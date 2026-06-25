import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  checkForUpdate,
  type DownloadProgress,
  downloadAndInstall,
  onCheckForUpdates,
  relaunchApp,
} from "@/api";
import type { UpdaterState } from "@/types";

const MAIN_WINDOW_LABEL = "main";

export type UpdaterController = {
  state: UpdaterState;
  checkManually: () => void;
  installAndRestart: () => void;
  dismiss: () => void;
};

// React's StrictMode runs effects twice in development; the actual auto-check
// must still fire exactly once per Window mount, so this module-level ref
// gates it. The `main` Window label check below is the production gate
// (non-main Windows skip auto-check entirely, no matter what this ref says).
const autoCheckFiredOnce = { current: false };

export function useUpdater(): UpdaterController {
  const [state, setState] = useState<UpdaterState>({ kind: "idle" });

  // The latest call's id; a stale resolve from an earlier check must not
  // overwrite a fresher one.
  const requestIdRef = useRef(0);

  // `state` accessed inside callbacks reads the closure-captured value; we
  // need the latest to dedupe re-entries.
  const stateRef = useRef<UpdaterState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const runCheck = useCallback(async (mode: "auto" | "manual") => {
    // In-flight dedupe: ignore if a check / download / install is already in
    // progress. `idle | available | error` are restartable.
    const current = stateRef.current;
    if (
      current.kind === "checking" ||
      current.kind === "downloading" ||
      current.kind === "installing"
    ) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const isLatest = () => requestId === requestIdRef.current;

    setState({ kind: "checking" });

    try {
      const update = await checkForUpdate();
      if (!isLatest()) return;

      if (update) {
        setState({ kind: "available", update, version: update.version });
      } else if (mode === "manual") {
        // Manual checks need an explicit "no update" confirmation; the auto
        // path stays silent to avoid noise on every cold start.
        toast.info("Cork is up to date.");
        setState({ kind: "idle" });
      } else {
        setState({ kind: "idle" });
      }
    } catch (err) {
      if (!isLatest()) return;
      const message = String(err);
      if (mode === "manual") {
        toast.error(`Update check failed: ${message}`);
        setState({ kind: "idle" });
      } else {
        // Auto-check: stay silent. Next launch retries.
        console.error("Auto update check failed:", err);
        setState({ kind: "idle" });
      }
    }
  }, []);

  // Auto-check on mount: only in the `main` Window. `main` is the label every
  // Cork process's first Window gets (see `lib.rs::MAIN_WINDOW_LABEL`);
  // subsequent `workspace-<n>` Windows skip auto-check. This is the
  // process-singleton gate — no shared state or IPC required.
  useEffect(() => {
    if (autoCheckFiredOnce.current) return;
    const label = getCurrentWebviewWindow().label;
    if (label !== MAIN_WINDOW_LABEL) return;
    autoCheckFiredOnce.current = true;
    runCheck("auto");
  }, [runCheck]);

  // Manual check via menu (any Window).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onCheckForUpdates(() => runCheck("manual")).then(
      (fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      },
      (err) => console.error("Failed to subscribe to Check for Updates menu:", err),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [runCheck]);

  const checkManually = useCallback(() => {
    runCheck("manual");
  }, [runCheck]);

  const installAndRestart = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind !== "available") return;
    const update = current.update;
    const version = current.version;
    setState({ kind: "downloading", version, downloaded: 0, contentLength: null });

    try {
      await downloadAndInstall(update, (event: DownloadProgress) => {
        if (event.event === "Started") {
          setState({
            kind: "downloading",
            version,
            downloaded: 0,
            contentLength: event.data.contentLength ?? null,
          });
        } else if (event.event === "Progress") {
          setState((prev) => {
            if (prev.kind !== "downloading") return prev;
            return { ...prev, downloaded: prev.downloaded + event.data.chunkLength };
          });
        } else if (event.event === "Finished") {
          setState({ kind: "installing", version });
        }
      });
      await relaunchApp();
    } catch (err) {
      const message = String(err);
      setState({ kind: "error", message, version });
    }
  }, []);

  const dismiss = useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  return { state, checkManually, installAndRestart, dismiss };
}
