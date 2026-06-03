import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { Plus } from "lucide-react";
import type { EditingEntry } from "../../types/settings";
import Button from "../ui/Button";
import StatusRow from "./StatusRow";

type Props = {
  editing: EditingEntry[];
  onLabelChange: (index: number, label: string) => void;
  onLabelBlur: (index: number) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

function StatusList({
  editing,
  onLabelChange,
  onLabelBlur,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemove,
  onAdd,
}: Props) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-xs font-medium text-cork-muted uppercase tracking-wider">
        Statuses
      </span>
      <DragDropProvider
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-1.5">
          {editing.map((s, i) => (
            <StatusRow
              key={s.id}
              id={s.id}
              index={i}
              label={s.label}
              onLabelChange={onLabelChange}
              onLabelBlur={onLabelBlur}
              onRemove={onRemove}
            />
          ))}
        </div>
      </DragDropProvider>
      <Button
        variant="dashed"
        size="md"
        onClick={onAdd}
        className="mt-2 w-full"
      >
        <Plus className="size-3.5" />
        Add Status
      </Button>
    </div>
  );
}

export default StatusList;
