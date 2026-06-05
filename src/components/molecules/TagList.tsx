import { clsx } from "clsx";

import { TagChip } from "@/components/atoms";

export type TagListProps = {
  tags: string[];
  maxVisible?: number;
  className?: string;
};

export function TagList({ tags, maxVisible = 3, className }: TagListProps) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, maxVisible);
  const overflow = tags.length - visible.length;
  return (
    <div className={clsx("flex flex-wrap items-center gap-1", className)}>
      {visible.map((tag) => (
        <TagChip key={tag} label={tag} />
      ))}
      {overflow > 0 && <TagChip label={`+${overflow}`} />}
    </div>
  );
}
