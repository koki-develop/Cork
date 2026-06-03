import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Trash2 } from "lucide-react";
import Button from "../ui/Button";

type Props = {
  id: string;
  index: number;
  label: string;
  onLabelChange: (index: number, label: string) => void;
  onRemove: (index: number) => void;
};

function StatusRow({ id, index, label, onLabelChange, onRemove }: Props) {
  const { ref, handleRef } = useSortable({
    id,
    index,
    type: "status-row",
    accept: "status-row",
  });

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      <button
        ref={handleRef}
        type="button"
        aria-label={`Drag to reorder status ${index + 1}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-cork-muted cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cork-accent/50"
      >
        <GripVertical className="size-3.5" />
      </button>
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(index, e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-sm text-cork-text outline-none transition-colors duration-200 placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30"
        placeholder="Status label"
        aria-label={`Status label ${index + 1}`}
      />
      <Button
        variant="ghost"
        color="danger"
        size="sm"
        onClick={() => onRemove(index)}
        aria-label="Remove status"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export default StatusRow;
