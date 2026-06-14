import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput, ErrorBanner } from "@/components/atoms";
import {
  DateField,
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
    tags,
    date,
    handleDateChange,
    error,
    tagEditorRef,
    handleTitleBlur,
    handleStatusChange,
    handleBodyChange,
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
        <div className="relative">
          <div className="absolute top-0 right-0 z-10 flex gap-1 md:hidden">
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
              onMouseDown={(e) => e.preventDefault()}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_15rem] md:gap-6">
            <div className="pr-14 pl-3 md:pr-0">
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
              onChange={handleBodyChange}
              onOpenLink={onOpenLink}
              onBlur={handleBodyBlur}
              placeholder="Add a description…"
              ariaLabel="Body"
              className="order-1 min-h-[20rem] md:order-none md:col-start-1 md:row-start-2"
            />

            <div className="flex flex-col gap-4 md:col-start-2 md:row-start-1 md:row-end-3">
              <FormField label="Status">
                <Select
                  value={status}
                  onChange={handleStatusChange}
                  options={statuses.map((s) => ({ label: s.label, value: s.label }))}
                />
              </FormField>

              <FormField label="Date">
                <DateField value={date} onChange={handleDateChange} ariaLabel="Date" />
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

              <div className="hidden md:order-first md:flex md:justify-end md:gap-1">
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
                  onMouseDown={(e) => e.preventDefault()}
                />
              </div>
            </div>
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
