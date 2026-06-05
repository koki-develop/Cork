import { X } from "lucide-react";

import { Text } from "@/components/atoms";
import type { TagFilter, TagFilterOperator } from "@/types";

import { IconButton } from "./IconButton";
import { Select, type SelectOption } from "./Select";
import { TagOperandInput, type TagOperandInputMode } from "./TagOperandInput";

export type FilterRowProps = {
  filter: TagFilter;
  onChange: (next: TagFilter) => void;
  onRemove: () => void;
  availableTags: string[];
};

const OPERATOR_OPTIONS: SelectOption[] = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "contains_any", label: "contains any of" },
  { value: "contains_all", label: "contains all of" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const modeForOperator = (op: TagFilterOperator): TagOperandInputMode => {
  switch (op) {
    case "contains":
    case "not_contains":
      return "single";
    case "contains_any":
    case "contains_all":
      return "multi";
    case "is_empty":
    case "is_not_empty":
      return "none";
  }
};

export function FilterRow({ filter, onChange, onRemove, availableTags }: FilterRowProps) {
  const mode = modeForOperator(filter.operator);
  const tags = "tags" in filter ? filter.tags : [];

  const handleOperatorChange = (next: string) => {
    const nextOp = next as TagFilterOperator;
    if (nextOp === "is_empty" || nextOp === "is_not_empty") {
      onChange({ id: filter.id, operator: nextOp });
    } else {
      onChange({ id: filter.id, operator: nextOp, tags });
    }
  };

  const handleTagsChange = (nextTags: string[]) => {
    if (!("tags" in filter)) return;
    onChange({ id: filter.id, operator: filter.operator, tags: nextTags });
  };

  return (
    <div className="flex items-start gap-2">
      <Text size="sm" className="text-cork-muted shrink-0 pt-1.5">
        Tags
      </Text>
      <div className="w-[160px] shrink-0">
        <Select
          value={filter.operator}
          onChange={handleOperatorChange}
          options={OPERATOR_OPTIONS}
        />
      </div>
      <div className="min-w-0 flex-1">
        <TagOperandInput
          mode={mode}
          tags={tags}
          onChange={handleTagsChange}
          availableTags={availableTags}
          ariaLabel="Filter tag"
        />
      </div>
      <IconButton icon={<X className="size-3.5" />} aria-label="Remove filter" onClick={onRemove} />
    </div>
  );
}
