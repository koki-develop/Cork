import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { X } from "lucide-react";
import { Heading } from "@/components/atoms";
import { IconButton } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import type { EditingEntry } from "@/types";
import { StatusList } from "./StatusList";
import { WorkspaceDirectoryField } from "./WorkspaceDirectoryField";

export type SettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  currentDir: string;
  onPickDirectory: () => void;
  editing: EditingEntry[];
  error: string | null;
  focusId: string | null;
  onLabelChange: (index: number, label: string) => void;
  onLabelBlur: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function SettingsDialog({
  isOpen,
  onClose,
  currentDir,
  onPickDirectory,
  editing,
  error,
  focusId,
  onLabelChange,
  onLabelBlur,
  onAdd,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: SettingsDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} closeAriaLabel="Close settings">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Heading level={2} variant="page">
          Settings
        </Heading>
        <IconButton
          icon={<X className="size-4" />}
          aria-label="Close"
          onClick={onClose}
        />
      </div>

      <WorkspaceDirectoryField
        path={currentDir}
        onPickDirectory={onPickDirectory}
      />

      <StatusList
        editing={editing}
        error={error}
        focusId={focusId}
        onLabelChange={onLabelChange}
        onLabelBlur={onLabelBlur}
        onAdd={onAdd}
        onRemove={onRemove}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      />
    </Modal>
  );
}
