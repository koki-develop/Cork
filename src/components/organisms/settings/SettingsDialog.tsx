import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/react";
import { useState } from "react";

import { ErrorBanner, Heading, Text } from "@/components/atoms";
import { DialogFooter, DialogHeader } from "@/components/molecules";
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
  onRemove: (index: number) => void | Promise<void>;
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
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemoveRequest = (index: number) => {
    setRemovingIndex(index);
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (removingIndex === null) return;
    setRemoveError(null);
    try {
      await onRemove(removingIndex);
      setRemovingIndex(null);
    } catch (e) {
      setRemoveError(String(e));
    }
  };

  const handleCancelRemove = () => {
    setRemovingIndex(null);
    setRemoveError(null);
  };

  const removingLabel = removingIndex !== null ? editing[removingIndex]?.label : "";

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        closeAriaLabel="Close settings"
        inert={removingIndex !== null}
      >
        <DialogHeader title="Settings" onClose={onClose} />

        <WorkspaceDirectoryField path={currentDir} onPickDirectory={onPickDirectory} />

        <StatusList
          editing={editing}
          error={error}
          focusId={focusId}
          onLabelChange={onLabelChange}
          onLabelBlur={onLabelBlur}
          onAdd={onAdd}
          onRemove={handleRemoveRequest}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        />
      </Modal>

      {removingIndex !== null && (
        <Modal isOpen={true} onClose={handleCancelRemove} closeAriaLabel="Cancel delete">
          <div className="flex flex-col gap-4">
            <Heading level={2} variant="page">
              Remove status?
            </Heading>
            <Text size="sm" className="text-cork-muted">
              This will permanently remove &ldquo;{removingLabel}&rdquo; and all tasks with this
              status will be moved to the "Unknown" column.
            </Text>
            {removeError && <ErrorBanner>{removeError}</ErrorBanner>}
            <DialogFooter
              onCancel={handleCancelRemove}
              cancelVariant="ghost"
              action={{
                label: "Remove",
                color: "danger",
                onClick: handleConfirmRemove,
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
