import { useSortable } from "@dnd-kit/react/sortable";
import { Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Input } from "@/components/atoms";
import { DragHandle, IconButton } from "@/components/molecules";

export type StatusRowProps = {
  id: string;
  index: number;
  label: string;
  onLabelChange: (index: number, label: string) => void;
  onLabelBlur: (index: number) => void;
  onRemove: (index: number) => void;
};

export function StatusRow({
  id,
  index,
  label,
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

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      <DragHandle
        handleRef={handleRef as Ref<HTMLButtonElement>}
        aria-label={`Drag to reorder status ${index + 1}`}
      />
      <Input
        value={label}
        onChange={(e) => onLabelChange(index, e.target.value)}
        onBlur={() => onLabelBlur(index)}
        placeholder="Status label"
        aria-label={`Status label ${index + 1}`}
      />
      <IconButton
        icon={<Trash2 className="size-3.5" />}
        aria-label="Remove status"
        variant="ghost"
        color="danger"
        onClick={() => onRemove(index)}
      />
    </div>
  );
}
