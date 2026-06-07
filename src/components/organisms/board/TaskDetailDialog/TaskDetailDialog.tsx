import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput } from "@/components/atoms";
import { DropdownMenu, FormField, IconButton, Select, TagEditor } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import type { StatusEntry, Task, TaskUpdates } from "@/types";

import { DeleteTaskConfirmDialog } from "../DeleteTaskConfirmDialog";
import { useTaskDialogState } from "./useTaskDialogState";

export type TaskDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  statuses: StatusEntry[];
  availableTags?: string[];
  onSaveTask: (taskId: string, updates: TaskUpdates) => Promise<void>;
  onDeleteTask: () => Promise<void>;
};

export function TaskDetailDialog({
  isOpen,
  onClose,
  task,
  statuses,
  availableTags,
  onSaveTask,
  onDeleteTask,
}: TaskDetailDialogProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    title,
    setTitle,
    status,
    body,
    setBody,
    tags,
    error,
    tagEditorRef,
    handleTitleBlur,
    handleStatusChange,
    handleBodyBlur,
    handleTagsChange,
    handleClose,
  } = useTaskDialogState({
    task,
    isLocked: deleteConfirmOpen,
    onSaveTask,
    onCommitClose: onClose,
  });

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(task.id);
      toast.success("Copied path to clipboard");
    } catch {
      toast.error("Failed to copy path to clipboard");
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeAriaLabel="Close"
        containerClassName="max-w-2xl"
        inert={deleteConfirmOpen}
      >
        <div className="flex items-center justify-end gap-1">
          <DropdownMenu
            trigger={<MoreHorizontal className="size-4" />}
            triggerAriaLabel="Task actions"
            items={[
              {
                label: "Copy path",
                icon: <Copy className="size-3.5" />,
                onClick: handleCopyPath,
              },
              {
                label: "Delete",
                icon: <Trash2 className="size-3.5" />,
                color: "danger",
                onClick: () => setDeleteConfirmOpen(true),
              },
            ]}
          />
          <IconButton
            icon={<X className="size-4" />}
            aria-label="Close"
            onClick={handleClose}
            // Keep focus on the active field so its blur-driven save handler
            // doesn't race handleClose.
            onMouseDown={(e) => e.preventDefault()}
          />
        </div>

        <div className="flex flex-col gap-4">
          <FormField label="Title" error={error?.message ?? null}>
            <AutoresizeInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
            />
          </FormField>

          <FormField label="Status">
            <Select
              value={status}
              onChange={handleStatusChange}
              options={statuses.map((s) => ({ label: s.label, value: s.label }))}
            />
          </FormField>

          <FormField label="Tags">
            <TagEditor
              ref={tagEditorRef}
              tags={tags}
              onChange={handleTagsChange}
              suggestions={availableTags}
              ariaLabel="Tags"
            />
          </FormField>

          <FormField label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={handleBodyBlur}
              placeholder="Body"
              aria-label="Body"
              rows={12}
              className="border-cork-border/40 bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-cork-accent/30 min-w-0 flex-1 resize-none rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus:ring-1"
            />
          </FormField>
        </div>
      </Modal>

      <DeleteTaskConfirmDialog
        isOpen={deleteConfirmOpen}
        taskTitle={task.title}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          await onDeleteTask();
          setDeleteConfirmOpen(false);
        }}
      />
    </>
  );
}
