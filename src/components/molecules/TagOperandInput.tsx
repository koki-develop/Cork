import { TagEditor } from "./TagEditor";

export type TagOperandInputMode = "single" | "multi" | "none";

export type TagOperandInputProps = {
  mode: TagOperandInputMode;
  tags: string[];
  onChange: (next: string[]) => void;
  availableTags: string[];
  ariaLabel?: string;
};

export function TagOperandInput({
  mode,
  tags,
  onChange,
  availableTags,
  ariaLabel,
}: TagOperandInputProps) {
  if (mode === "none") return null;
  return (
    <TagEditor
      tags={tags}
      onChange={onChange}
      suggestions={availableTags}
      maxTags={mode === "single" ? 1 : undefined}
      ariaLabel={ariaLabel}
    />
  );
}
