import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorBanner, Input, Text, Toggle } from "@/components/atoms";
import { CodeBlock, FormField, IconButton, StatusIndicator } from "@/components/molecules";
import type { McpSettings, McpStatus } from "@/types";

export type McpServerSectionProps = {
  settings: McpSettings;
  status: McpStatus;
  sampleConfig: string;
  onUpdateEnabled: (enabled: boolean) => void;
  onUpdateToken: (token: string) => void;
  onGenerateToken: () => void;
};

const MIN_TOKEN_LEN = 12;

type StatusVisual = { kind: "running" | "error"; label: string } | null;

/// Stopped is implied by the Toggle being OFF, so we hide the badge in that
/// case to avoid duplicating the same information.
function statusVisualFor(status: McpStatus): StatusVisual {
  switch (status.kind) {
    case "running":
      return { kind: "running", label: `Running on :${status.port}` };
    case "failed":
      return { kind: "error", label: status.error };
    case "stopped":
      return null;
  }
}

export function McpServerSection({
  settings,
  status,
  sampleConfig,
  onUpdateEnabled,
  onUpdateToken,
  onGenerateToken,
}: McpServerSectionProps) {
  const [tokenDraft, setTokenDraft] = useState<string>(settings.token);

  // Sync token draft from props when the underlying setting changes (backend
  // reload, hot-reload, Generate). Skip the overwrite when the field is
  // focused so we don't yank what the user is mid-typing.
  useEffect(() => {
    if (document.activeElement?.id === "mcp-token-input") return;
    setTokenDraft(settings.token);
  }, [settings.token]);

  const statusVisual = statusVisualFor(status);
  const tokenError =
    tokenDraft.length < MIN_TOKEN_LEN
      ? `Token must be at least ${MIN_TOKEN_LEN} characters.`
      : null;

  // Skip flushing partial tokens that the backend will reject; the visible
  // ErrorBanner already signals the issue.
  const handleTokenChange = (raw: string) => {
    setTokenDraft(raw);
    if (raw.length >= MIN_TOKEN_LEN) {
      onUpdateToken(raw);
    }
  };

  const handleCopyToken = () => {
    if (!settings.token) return;
    navigator.clipboard
      .writeText(settings.token)
      .then(() => toast.success("Copied token to clipboard"))
      .catch(() => toast.error("Failed to copy token to clipboard"));
  };

  const sampleEmpty = sampleConfig === "{}" || sampleConfig === "";

  return (
    <div className="border-cork-border/40 mt-5 border-t pt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Text variant="label" size="xs">
          MCP Server
        </Text>
        {statusVisual && <StatusIndicator kind={statusVisual.kind} label={statusVisual.label} />}
      </div>

      {status.kind === "failed" && <ErrorBanner className="mb-4">{status.error}</ErrorBanner>}

      <div className="border-cork-border/40 bg-cork-elevated/40 mb-4 flex items-center justify-between rounded-lg border px-3 py-2">
        <Text size="sm">Enable MCP Server</Text>
        <Toggle
          aria-label="Enable MCP Server"
          checked={settings.enabled}
          onChange={onUpdateEnabled}
        />
      </div>

      {settings.enabled && (
        <div className="flex flex-col gap-4">
          <FormField label="Auth Token">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="mcp-token-input"
                  aria-label="Auth Token"
                  value={tokenDraft}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  className="w-full pr-9 font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="absolute top-1/2 right-1 -translate-y-1/2">
                  <IconButton
                    aria-label="Generate new token"
                    icon={<RefreshCw className="size-3.5" />}
                    onClick={onGenerateToken}
                  />
                </div>
              </div>
              <IconButton
                aria-label="Copy token"
                icon={<Copy className="size-3.5" />}
                onClick={handleCopyToken}
              />
            </div>
            {tokenError && <ErrorBanner className="mt-2">{tokenError}</ErrorBanner>}
          </FormField>

          <FormField label="mcp.json">
            {sampleEmpty ? (
              <Text variant="muted" size="xs">
                Open a workspace first.
              </Text>
            ) : (
              <CodeBlock
                ariaLabel="mcp.json snippet"
                code={sampleConfig}
                copyToast="Copied mcp.json to clipboard"
              />
            )}
          </FormField>
        </div>
      )}
    </div>
  );
}
