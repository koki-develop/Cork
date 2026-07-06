import { useCallback } from "react";
import { toast } from "sonner";

export type CopyToClipboardMessages = {
  success: string;
  failure: string;
};

/**
 * `navigator.clipboard.writeText` + a success/failure `toast`, shared by
 * every "copy to clipboard" affordance in the app (the read-only `CodeBlock`
 * molecule's copy button, `TaskContextMenu` / `TaskDetailDialog`'s "Copy
 * path", `McpServerSection`'s "Copy token", `CodeBlockCopyPlugin`'s
 * code-block copy button) so the shape lives in exactly one place instead of
 * being hand-rolled at each call site.
 */
export function useCopyToClipboard() {
  return useCallback((text: string, messages: CopyToClipboardMessages) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(messages.success);
      })
      .catch(() => {
        toast.error(messages.failure);
      });
  }, []);
}
