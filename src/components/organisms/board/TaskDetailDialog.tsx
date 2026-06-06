import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput } from "@/components/atoms";
import { DropdownMenu, FormField, IconButton, Select, TagEditor } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import { useDialogError } from "@/hooks/ui/useDialogError";
import { useTagEditorController } from "@/hooks/ui/useTagEditorController";
import { computeDirtyUpdates, type TaskFormSnapshot, withTaskUpdates } from "@/lib/task";
import type { StatusEntry, Task, TaskUpdates } from "@/types";

import { DeleteTaskConfirmDialog } from "./DeleteTaskConfirmDialog";

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
  // State and the dirty-tracking baseline initialize once per mount from the
  // freshly-fetched `task`. BoardPage remounts this dialog (via a `key` bumped
  // on each open), so every open re-seeds these from the latest task without a
  // prop-sync effect. Field saves keep `originalRef` current as they persist.
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [body, setBody] = useState(task.body);
  const [tags, setTags] = useState<string[]>(task.tags);
  const { error, setError, clearError } = useDialogError();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const originalRef = useRef<TaskFormSnapshot>({
    title: task.title,
    status: task.status,
    body: task.body,
    tags: task.tags,
  });
  const tagEditor = useTagEditorController();

  const save = async (updates: TaskUpdates) => {
    clearError();
    try {
      await onSaveTask(task.id, updates);
      originalRef.current = withTaskUpdates(originalRef.current, updates);
    } catch (e) {
      setError(String(e));
      // Roll local input state back to the last-persisted values so the UI
      // never claims a value is saved when it isn't (otherwise the next
      // blur sees value === originalRef and skips re-saving).
      if (updates.title !== undefined) setTitle(originalRef.current.title);
      if (updates.status !== undefined) setStatus(originalRef.current.status);
      if (updates.body !== undefined) setBody(originalRef.current.body);
      if (updates.tags !== undefined) setTags(originalRef.current.tags);
    }
  };

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(originalRef.current.title);
      return;
    }
    if (trimmed !== originalRef.current.title) {
      save({ title: trimmed });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    if (newStatus !== originalRef.current.status) {
      save({ status: newStatus });
    }
  };

  const handleBodyBlur = () => {
    if (body !== originalRef.current.body) {
      save({ body });
    }
  };

  const handleTagsChange = (next: string[]) => {
    setTags(next);
    const dirty = computeDirtyUpdates(originalRef.current, {
      title: originalRef.current.title,
      status: originalRef.current.status,
      body: originalRef.current.body,
      tags: next,
    });
    if (dirty.tags !== undefined) save({ tags: next });
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(task.id);
      toast.success("Copied path to clipboard");
    } catch {
      toast.error("Failed to copy path to clipboard");
    }
  };

  const handleClose = async () => {
    if (deleteConfirmOpen) return;
    // Drain — but only fold pending into dirtyUpdates if the user typed
    // something new. Tag chip add/remove already triggers immediate saves
    // via handleTagsChange, so close-time tag-flush only matters when
    // there is unsubmitted text in the editor's input.
    const pendingTag = tagEditor.flushPending();
    const finalTags = pendingTag ? [...tags, pendingTag] : tags;
    const trimmedTitle = title.trim();
    const current: TaskFormSnapshot = {
      // Blank title is silently kept as the original (the title-required
      // invariant only applies on field blur, not on dialog close).
      title: trimmedTitle || originalRef.current.title,
      status,
      body,
      tags: finalTags,
    };
    const dirtyUpdates = computeDirtyUpdates(originalRef.current, current);

    if (pendingTag) setTags(finalTags);

    if (Object.keys(dirtyUpdates).length > 0) {
      try {
        await onSaveTask(task.id, dirtyUpdates);
        originalRef.current = withTaskUpdates(originalRef.current, dirtyUpdates);
      } catch (e) {
        setError(String(e));
        // Keep the dialog open so the user can see their unsaved edits
        // and the error banner together.
        return;
      }
    }
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeAriaLabel="Close"
        containerClassName="max-w-2xl"
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
          <IconButton icon={<X className="size-4" />} aria-label="Close" onClick={handleClose} />
        </div>

        <div className="flex flex-col gap-4">
          <FormField label="Title" error={error}>
            <AutoresizeInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              autoFocus
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
              ref={tagEditor.ref}
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
