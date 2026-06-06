import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AutoresizeInput, Button, Heading, Text } from "@/components/atoms";
import {
  DropdownMenu,
  ErrorBanner,
  IconButton,
  Select,
  TagEditor,
  type TagEditorHandle,
} from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import type { StatusEntry, Task, TaskUpdates } from "@/types";

export type TaskDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  statuses: StatusEntry[];
  availableTags?: string[];
  onSaveTask: (taskId: string, updates: TaskUpdates) => Promise<void>;
  onDeleteTask: () => Promise<void>;
};

const tagsEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

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
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const originalRef = useRef({
    title: task.title,
    status: task.status,
    body: task.body,
    tags: task.tags,
  });
  const tagEditorRef = useRef<TagEditorHandle>(null);

  const hasFieldChanged = (field: "title" | "status" | "body", value: string) =>
    value !== originalRef.current[field];

  const hasTagsChanged = (next: string[]) => !tagsEqual(next, originalRef.current.tags);

  const save = async (updates: TaskUpdates) => {
    setError(null);
    try {
      await onSaveTask(task.id, updates);
      if (updates.title !== undefined) originalRef.current.title = updates.title;
      if (updates.status !== undefined) originalRef.current.status = updates.status;
      if (updates.body !== undefined) originalRef.current.body = updates.body;
      if (updates.tags !== undefined) originalRef.current.tags = updates.tags;
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
    if (hasFieldChanged("title", trimmed)) {
      save({ title: trimmed });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    if (hasFieldChanged("status", newStatus)) {
      save({ status: newStatus });
    }
  };

  const handleBodyBlur = () => {
    if (hasFieldChanged("body", body)) {
      save({ body });
    }
  };

  const handleTagsChange = (next: string[]) => {
    setTags(next);
    if (hasTagsChanged(next)) {
      save({ tags: next });
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteError(null);
    try {
      await onDeleteTask();
      setDeleteConfirmOpen(false);
    } catch (e) {
      setDeleteError(String(e));
    }
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
    const pendingTag = tagEditorRef.current?.flushPending() ?? "";
    const dirtyUpdates: TaskUpdates = {};
    const trimmed = title.trim();
    if (trimmed && hasFieldChanged("title", trimmed)) dirtyUpdates.title = trimmed;
    if (hasFieldChanged("status", status)) dirtyUpdates.status = status;
    if (hasFieldChanged("body", body)) dirtyUpdates.body = body;
    if (pendingTag) {
      const finalTags = [...tags, pendingTag];
      setTags(finalTags);
      dirtyUpdates.tags = finalTags;
    }

    if (Object.keys(dirtyUpdates).length > 0) {
      try {
        await onSaveTask(task.id, dirtyUpdates);
        if (dirtyUpdates.title !== undefined) originalRef.current.title = dirtyUpdates.title;
        if (dirtyUpdates.status !== undefined) originalRef.current.status = dirtyUpdates.status;
        if (dirtyUpdates.body !== undefined) originalRef.current.body = dirtyUpdates.body;
        if (dirtyUpdates.tags !== undefined) originalRef.current.tags = dirtyUpdates.tags;
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
          <div className="flex flex-col gap-1.5">
            <Text variant="label" size="xs" className="block">
              Title
            </Text>
            <AutoresizeInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              autoFocus
            />
            {error && <ErrorBanner className="mt-1">{error}</ErrorBanner>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Text variant="label" size="xs" className="block">
              Status
            </Text>
            <Select
              value={status}
              onChange={handleStatusChange}
              options={statuses.map((s) => ({
                label: s.label,
                value: s.label,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Text variant="label" size="xs" className="block">
              Tags
            </Text>
            <TagEditor
              ref={tagEditorRef}
              tags={tags}
              onChange={handleTagsChange}
              suggestions={availableTags}
              ariaLabel="Tags"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Text variant="label" size="xs" className="block">
              Body
            </Text>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={handleBodyBlur}
              placeholder="Body"
              aria-label="Body"
              rows={12}
              className="border-cork-border/40 bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-cork-accent/30 min-w-0 flex-1 resize-none rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus:ring-1"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
        closeAriaLabel="Cancel delete"
        containerClassName="max-w-sm"
      >
        <div className="flex flex-col gap-4">
          <Heading level={2} variant="page">
            Delete task?
          </Heading>
          <Text size="sm" className="text-cork-muted">
            This will permanently delete &ldquo;{task.title}&rdquo;. This action cannot be undone.
          </Text>
          {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" color="danger" size="md" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
