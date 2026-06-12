import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput, ErrorBanner } from "@/components/atoms";
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
  onOpenLink: (url: string) => void;
};

export function TaskDetailDialog({
  isOpen,
  onClose,
  task,
  statuses,
  availableTags,
  onSaveTask,
  onDeleteTask,
  onOpenLink,
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
        // Trim the panel's left and bottom padding (p-6 → pl-4 / pb-4) so the
        // borderless title and body sit a touch closer to the edges; pl-4 / pb-4
        // sort after p-6 in Tailwind's output so they override only those sides.
        containerClassName="pl-4 pb-4"
      >
        {/* A single 2-column row: the editable Title + Body fill the left
            column, the action chrome + Status + Tags fill the right sidebar.
            Mirroring CreateTaskDialog's layout, the sidebar is top-aligned and
            independent of the Title's height — a Title that wraps to several
            lines only pushes the Body down, so Status and Tags stay pinned to
            the top instead of drifting down with it. The columns share the same
            md:flex-1 / md:w-60 widths, so the Title's right edge lines up with
            the Body's while the overflow/close chrome sits in the top-right
            corner. */}
        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          <div className="flex min-w-0 flex-col md:flex-1">
            {/* The underline sits on the input, but its left inset comes from this
                pl-3 wrapper rather than the input's own padding — so the border
                starts at the first character instead of poking out into the
                padding. The input keeps pr-3 for its right inset. */}
            <div className="pl-3">
              <AutoresizeInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                placeholder="Task title"
                aria-label="Title"
                className="text-cork-text placeholder:text-cork-muted/40 border-cork-border/40 border-b pr-3 pb-3 text-2xl font-bold tracking-tight placeholder:font-normal focus-visible:outline-none"
              />
              {error?.message && <ErrorBanner className="mt-1.5">{error.message}</ErrorBanner>}
            </div>

            <MarkdownEditor
              initialValue={task.body}
              onChange={setBody}
              onOpenLink={onOpenLink}
              onBlur={handleBodyBlur}
              placeholder="Add a description…"
              ariaLabel="Body"
              className="mt-4 min-h-[20rem] flex-1"
            />
          </div>

          <div className="flex flex-col gap-4 md:w-60 md:shrink-0">
            {/* The overflow-menu + close chrome leads the sidebar, landing in
                the dialog's top-right corner above Status and Tags. */}
            <div className="flex justify-end gap-1">
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
