import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  generateMcpToken,
  getMcpSampleConfig,
  getMcpServerStatus,
  getMcpSettings,
  getMcpSetupSnippets,
  onMcpSettingsChange,
  updateMcpSettings,
} from "@/api";
import type { McpSettings, McpSetupSnippet, McpStatus } from "@/types";

const PLACEHOLDER_SETTINGS: McpSettings = { enabled: false, token: "" };
const STOPPED_STATUS: McpStatus = { kind: "stopped" };

export type McpController = {
  settings: McpSettings;
  status: McpStatus;
  sampleConfig: string;
  setupSnippets: McpSetupSnippet[];
  /**
   * Tracks whether the initial `getMcpSettings` resolved. Until it does, the
   * UI cannot persist updates (it would flush a placeholder token and the
   * backend would reject with `validate_token`).
   */
  loaded: boolean;
  updateEnabled: (enabled: boolean) => void;
  updateToken: (token: string) => void;
  regenerateToken: () => void;
};

export function useMcpSettings(isDialogOpen: boolean): McpController {
  const [settings, setSettings] = useState<McpSettings>(PLACEHOLDER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<McpStatus>(STOPPED_STATUS);
  const [sampleConfig, setSampleConfig] = useState<string>("{}");
  const [setupSnippets, setSetupSnippets] = useState<McpSetupSnippet[]>([]);

  // Race guard for `refresh`. `refresh` fires from three independent sources
  // (mount, dialog-open, `store://change`) and each fans out into 3 parallel
  // IPC calls. Without this, an older refresh's late response could overwrite
  // a newer one's already-applied state, leaving the UI permanently stale
  // until the next event nudge. Same pattern as `useWorkspaceTasks`.
  const requestIdRef = useRef(0);

  // Pull every reactive value the dialog renders. Called on mount, on each
  // dialog open (catches any drift while the dialog was closed), and on every
  // `store://change` event for the mcp key (catches mutations from this and
  // other windows).
  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;
    const isLatest = () => requestId === requestIdRef.current;

    getMcpSettings().then(
      (s) => {
        if (!isLatest()) return;
        setSettings(s);
        setLoaded(true);
      },
      (err) => {
        if (!isLatest()) return;
        toast.error(`Failed to load MCP settings: ${err}`);
      },
    );
    getMcpServerStatus().then(
      (s) => {
        if (!isLatest()) return;
        setStatus(s);
      },
      (err) => {
        if (!isLatest()) return;
        console.error("MCP status fetch failed:", err);
      },
    );
    getMcpSampleConfig().then(
      (s) => {
        if (!isLatest()) return;
        setSampleConfig(s);
      },
      (err) => {
        if (!isLatest()) return;
        console.error("MCP sample config fetch failed:", err);
      },
    );
    getMcpSetupSnippets().then(
      (s) => {
        if (!isLatest()) return;
        setSetupSnippets(s);
      },
      (err) => {
        if (!isLatest()) return;
        console.error("MCP setup snippets fetch failed:", err);
      },
    );
  }, []);

  // Initial load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh when the dialog opens: covers AppState-only changes that don't
  // emit a store event (most relevant: another window opened a workspace, so
  // the sample mcp.json should include it).
  useEffect(() => {
    if (!isDialogOpen) return;
    refresh();
  }, [isDialogOpen, refresh]);

  // Subscribe to `store://change` for the mcp key for the lifetime of the
  // hook. Cross-window writes (and our own) trigger this, so the dialog
  // reflects the new token/enabled immediately — no polling needed.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onMcpSettingsChange(refresh).then(
      (fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      },
      (err) => console.error("Failed to subscribe to MCP settings changes:", err),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  const persist = useCallback((next: McpSettings) => {
    updateMcpSettings(next).then(
      (s) => setStatus(s),
      (err) => toast.error(`Failed to update MCP settings: ${err}`),
    );
  }, []);

  const updateEnabled = useCallback(
    (enabled: boolean) => {
      if (!loaded) return;
      const next: McpSettings = { ...settings, enabled };
      setSettings(next);
      persist(next);
    },
    [loaded, settings, persist],
  );

  const updateToken = useCallback(
    (token: string) => {
      if (!loaded) return;
      const next: McpSettings = { ...settings, token };
      setSettings(next);
      persist(next);
    },
    [loaded, settings, persist],
  );

  const regenerateToken = useCallback(() => {
    if (!loaded) return;
    generateMcpToken().then(
      (token) => {
        const next: McpSettings = { ...settings, token };
        setSettings(next);
        persist(next);
      },
      (err) => toast.error(`Failed to generate token: ${err}`),
    );
  }, [loaded, settings, persist]);

  return {
    settings,
    status,
    sampleConfig,
    setupSnippets,
    loaded,
    updateEnabled,
    updateToken,
    regenerateToken,
  };
}
