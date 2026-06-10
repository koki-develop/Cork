import { Copy } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { IconButton } from "./IconButton";

export type CodeBlockProps = {
  code: string;
  copyToast?: string;
  ariaLabel?: string;
  className?: string;
};

export function CodeBlock({
  code,
  copyToast = "Copied to clipboard",
  ariaLabel,
  className,
}: CodeBlockProps) {
  const handleCopy = useCallback(() => {
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        toast.success(copyToast);
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard");
      });
  }, [code, copyToast]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <pre
        aria-label={ariaLabel}
        className="border-cork-border/40 bg-cork-elevated/60 text-cork-text max-h-72 overflow-auto rounded-lg border px-3 py-2 pr-12 font-mono text-xs"
      >
        {code}
      </pre>
      <div className="absolute top-1.5 right-1.5">
        <IconButton
          aria-label={ariaLabel ? `Copy ${ariaLabel}` : "Copy snippet"}
          icon={<Copy className="size-3.5" />}
          onClick={handleCopy}
        />
      </div>
    </div>
  );
}
