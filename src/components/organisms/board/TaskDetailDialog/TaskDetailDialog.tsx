import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput } from "@/components/atoms";
import {
  DropdownMenu,
  FormField,
  IconButton,
  MarkdownEditor,
  Select,
  TagEditor,
} from "@/components/molecules";
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
        maxWidthClassName="max-w-4xl"
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

        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          <div className="flex min-w-0 flex-col gap-4 md:flex-1">
            <FormField label="Title" error={error?.message ?? null}>
              <AutoresizeInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
              />
            </FormField>

            <FormField label="Body" className="md:flex-1">
              <MarkdownEditor
                initialValue={task.body}
                onChange={setBody}
                onBlur={handleBodyBlur}
                placeholder="Body"
                ariaLabel="Body"
                className="min-h-[16rem] flex-1"
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-4 md:w-60 md:shrink-0">
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
          </div>
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
