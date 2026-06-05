import { useSortable } from "@dnd-kit/react/sortable";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { type Ref, useEffect, useRef } from "react";

import { Input } from "@/components/atoms";
import { DragHandle, DropdownMenu } from "@/components/molecules";

export type StatusRowProps = {
  id: string;
  index: number;
  label: string;
  autoFocus?: boolean;
  onLabelChange: (index: number, label: string) => void;
  onLabelBlur: (index: number) => void;
  onRemove: (index: number) => void;
};

export function StatusRow({
  id,
  index,
  label,
  autoFocus,
  onLabelChange,
  onLabelBlur,
  onRemove,
}: StatusRowProps) {
  const { ref, handleRef } = useSortable({
    id,
    index,
    type: "status-row",
    accept: "status-row",
  });

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      <DragHandle
        handleRef={handleRef as Ref<HTMLButtonElement>}
        aria-label={`Drag to reorder status ${index + 1}`}
      />
      <Input
        ref={inputRef}
        value={label}
        onChange={(e) => onLabelChange(index, e.target.value)}
        onBlur={() => onLabelBlur(index)}
        placeholder="Status label"
        aria-label={`Status label ${index + 1}`}
      />
      <DropdownMenu
        trigger={<MoreHorizontal className="size-3.5" />}
        triggerAriaLabel="Status actions"
        items={[
          {
            label: "Remove",
            icon: <Trash2 className="size-3.5" />,
            color: "danger",
            onClick: () => onRemove(index),
          },
        ]}
      />
    </div>
  );
}
