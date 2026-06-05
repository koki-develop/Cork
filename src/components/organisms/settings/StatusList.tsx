import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { Plus } from "lucide-react";

import { Button, Text } from "@/components/atoms";
import { ErrorBanner } from "@/components/molecules";
import type { EditingEntry } from "@/types";

import { StatusRow } from "./StatusRow";

export type StatusListProps = {
  editing: EditingEntry[];
  error: string | null;
  focusId: string | null;
  onLabelChange: (index: number, label: string) => void;
  onLabelBlur: (index: number) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

export function StatusList({
  editing,
  error,
  focusId,
  onLabelChange,
  onLabelBlur,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemove,
  onAdd,
}: StatusListProps) {
  return (
    <div className="mb-5">
      <Text variant="label" size="xs" className="mb-2 block">
        Statuses
      </Text>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <DragDropProvider onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-1.5">
          {editing.map((s, i) => (
            <StatusRow
              key={s.id}
              id={s.id}
              index={i}
              label={s.label}
              autoFocus={focusId === s.id}
              onLabelChange={onLabelChange}
              onLabelBlur={onLabelBlur}
              onRemove={onRemove}
            />
          ))}
        </div>
      </DragDropProvider>
      <Button variant="dashed" size="md" onClick={onAdd} className="mt-2 w-full">
        <Plus className="size-3.5" />
        Add Status
      </Button>
    </div>
  );
}
