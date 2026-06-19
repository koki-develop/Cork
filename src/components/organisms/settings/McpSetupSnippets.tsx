import { clsx } from "clsx";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import { Text } from "@/components/atoms";
import { CodeBlock } from "@/components/molecules";
import { isArrowDownKey, isArrowUpKey } from "@/lib/keyboard";
import type { McpSetupSnippet } from "@/types";

export type McpSetupSnippetsProps = {
  snippets: McpSetupSnippet[];
};

/**
 * Tool-by-tool setup helpers shown under the `mcp.json` snippet. Each tab is
 * one external client (Claude Code / Codex CLI / opencode); the panel shows
 * where the snippet goes plus the copy-pasteable code. Implements the WAI-ARIA
 * tabs pattern (roving `tabIndex`, arrow / Home / End navigation with automatic
 * activation) since the panels are cheap to swap.
 */
export function McpSetupSnippets({ snippets }: McpSetupSnippetsProps) {
  const baseId = useId();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (snippets.length === 0) return null;

  // Guard the index against drifting past the list when the open workspace —
  // and therefore the snippet set — changes underneath us.
  const active = Math.min(selected, snippets.length - 1);
  const activeSnippet = snippets[active];

  const focusTab = (index: number) => {
    setSelected(index);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const last = snippets.length - 1;
    if (e.key === "ArrowRight" || isArrowDownKey(e)) {
      e.preventDefault();
      focusTab(active === last ? 0 : active + 1);
      return;
    }
    if (e.key === "ArrowLeft" || isArrowUpKey(e)) {
      e.preventDefault();
      focusTab(active === 0 ? last : active - 1);
      return;
    }
    switch (e.key) {
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(last);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="MCP setup tool"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className="border-cork-border/40 bg-cork-elevated/40 flex gap-1 rounded-lg border p-1"
      >
        {snippets.map((snip, index) => {
          const isActive = index === active;
          return (
            <button
              key={snip.tool}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={isActive}
              // Every tab controls the same panel: selecting one swaps the
              // panel's content rather than revealing a per-tab panel, so all
              // tabs point at the single rendered `-panel` id (an index-keyed
              // id would dangle for the inactive tabs, which render no panel).
              aria-controls={`${baseId}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setSelected(index)}
              className={clsx(
                "flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                isActive
                  ? "bg-cork-surface text-cork-text shadow-sm"
                  : "text-cork-muted hover:text-cork-text",
              )}
            >
              {snip.tool}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="flex flex-col gap-1.5"
      >
        <Text variant="muted" size="xs">
          {activeSnippet.hint}
        </Text>
        <CodeBlock
          ariaLabel={`${activeSnippet.tool} setup snippet`}
          code={activeSnippet.code}
          copyToast={`Copied ${activeSnippet.tool} setup to clipboard`}
        />
      </div>
    </div>
  );
}
