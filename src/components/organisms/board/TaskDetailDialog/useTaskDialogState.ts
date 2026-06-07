import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { useFieldError } from "@/hooks/ui/useFieldError";
import { useTagEditorController } from "@/hooks/ui/useTagEditorController";
import { computeDirtyUpdates, type TaskFormSnapshot, withTaskUpdates } from "@/lib/task";
import type { Task, TaskUpdates } from "@/types";

type FieldKey = keyof TaskUpdates;

function withFieldReverted(
  snapshot: TaskFormSnapshot,
  field: FieldKey,
  original: TaskFormSnapshot,
): TaskFormSnapshot {
  return {
    title: field === "title" ? original.title : snapshot.title,
    status: field === "status" ? original.status : snapshot.status,
    body: field === "body" ? original.body : snapshot.body,
    tags: field === "tags" ? original.tags : snapshot.tags,
  };
}

export type UseTaskDialogStateOptions = {
  task: Task;
  /** When true, close attempts are ignored (e.g. a nested confirm dialog is up). */
  isLocked: boolean;
  onSaveTask: (taskId: string, updates: TaskUpdates) => Promise<void>;
  /** Called after the dialog has settled on closing. */
  onCommitClose: () => void;
};

type TrySaveResult = { ok: true } | { ok: false; message: string };

/**
 * State machine for the task detail dialog. Owns:
 *
 * - the editable form state (title / status / body / tags) and its baseline,
 * - the single tagged error that backs the inline banner + close fallback,
 * - per-field auto-save (blur for title/body, change for status/tags),
 * - a 2-step close: 1st attempt persists pending edits and surfaces any
 *   error inline; 2nd attempt retries with the latest values, then if it
 *   still fails it discards the offending field, salvages anything else
 *   the user changed, and closes with a toast of the latest error.
 *
 * The "2nd attempt" is detected by checking whether an error was already
 * present at handler entry — there's no separate counter, because the only
 * way to reach handleClose with an error showing is to have surfaced it
 * earlier (from a blur save or a prior 1st-attempt close).
 */
export function useTaskDialogState({
  task,
  isLocked,
  onSaveTask,
  onCommitClose,
}: UseTaskDialogStateOptions) {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [body, setBody] = useState(task.body);
  const [tags, setTags] = useState<string[]>(task.tags);

  // Dirty-tracking baseline initialized once per mount from the freshly-
  // fetched task; BoardPage remounts via a `key` bump on each open, so this
  // re-seeds without a prop-sync effect. Successful saves keep it current.
  const originalRef = useRef<TaskFormSnapshot>({
    title: task.title,
    status: task.status,
    body: task.body,
    tags: task.tags,
  });

  const { error, set: setError, clear: clearError, peek: peekError } = useFieldError<FieldKey>();
  const tagEditor = useTagEditorController();

  const revertField = useCallback((field: FieldKey) => {
    switch (field) {
      case "title":
        setTitle(originalRef.current.title);
        return;
      case "status":
        setStatus(originalRef.current.status);
        return;
      case "body":
        setBody(originalRef.current.body);
        return;
      case "tags":
        setTags(originalRef.current.tags);
        return;
    }
  }, []);

  const trySave = useCallback(
    async (updates: TaskUpdates): Promise<TrySaveResult> => {
      try {
        await onSaveTask(task.id, updates);
        originalRef.current = withTaskUpdates(originalRef.current, updates);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: String(e) };
      }
    },
    [onSaveTask, task.id],
  );

  // Single-field auto-save: clears any prior error and attributes a fresh
  // failure to the given field so the give-up close can revert exactly it.
  const autoSave = useCallback(
    async (field: FieldKey, updates: TaskUpdates) => {
      clearError();
      const result = await trySave(updates);
      if (!result.ok) setError({ message: result.message, field });
    },
    [clearError, setError, trySave],
  );

  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      // Title is required at field level (close-time blank is tolerated
      // separately by handleClose's snapshot fallback).
      setTitle(originalRef.current.title);
      return;
    }
    if (trimmed !== originalRef.current.title) {
      void autoSave("title", { title: trimmed });
    }
  }, [autoSave, title]);

  const handleStatusChange = useCallback(
    (next: string) => {
      setStatus(next);
      if (next !== originalRef.current.status) {
        void autoSave("status", { status: next });
      }
    },
    [autoSave],
  );

  const handleBodyBlur = useCallback(() => {
    if (body !== originalRef.current.body) {
      void autoSave("body", { body });
    }
  }, [autoSave, body]);

  const handleTagsChange = useCallback(
    (next: string[]) => {
      setTags(next);
      const dirty = computeDirtyUpdates(originalRef.current, {
        title: originalRef.current.title,
        status: originalRef.current.status,
        body: originalRef.current.body,
        tags: next,
      });
      if (dirty.tags !== undefined) {
        void autoSave("tags", { tags: next });
      }
    },
    [autoSave],
  );

  const handleClose = useCallback(async () => {
    if (isLocked) return;

    // Fold any unsubmitted tag text into the closing snapshot — chip
    // add/remove already auto-saves through handleTagsChange, so this only
    // matters when the editor's input still holds text.
    const pendingTag = tagEditor.flushPending();
    const finalTags = pendingTag ? [...tags, pendingTag] : tags;
    if (pendingTag) setTags(finalTags);

    const previousError = peekError();
    const trimmedTitle = title.trim();
    const current: TaskFormSnapshot = {
      // Blank title is silently kept as the original at close time; the
      // title-required invariant only fires on blur.
      title: trimmedTitle || originalRef.current.title,
      status,
      body,
      tags: finalTags,
    };
    const dirty = computeDirtyUpdates(originalRef.current, current);

    if (Object.keys(dirty).length === 0) {
      // Nothing left to persist (user may have reverted manually). Surface
      // a lingering error as a toast so it isn't lost with the banner.
      if (previousError) toast.error(previousError.message);
      onCommitClose();
      return;
    }

    const primary = await trySave(dirty);

    if (primary.ok) {
      clearError();
      onCommitClose();
      return;
    }

    if (!previousError) {
      // 1st close attempt surfaced this error: stay open so the user can
      // either fix it or press close again to give up.
      const keys = Object.keys(dirty) as FieldKey[];
      const failedField = keys.length === 1 ? keys[0]! : null;
      setError({ message: primary.message, field: failedField });
      return;
    }

    // 2nd close attempt and the save still fails. Give up: revert the field
    // the prior error attributed to (or every dirty field if it was an
    // unattributable multi-field save), salvage whatever else the user
    // changed, and close with the latest error.
    if (previousError.field) {
      revertField(previousError.field);
      const salvageSnapshot = withFieldReverted(current, previousError.field, originalRef.current);
      const salvage = computeDirtyUpdates(originalRef.current, salvageSnapshot);
      if (Object.keys(salvage).length > 0) {
        const salvageResult = await trySave(salvage);
        if (!salvageResult.ok) toast.error(salvageResult.message);
      }
    } else {
      for (const key of Object.keys(dirty) as FieldKey[]) revertField(key);
    }

    toast.error(primary.message);
    onCommitClose();
  }, [
    isLocked,
    tagEditor,
    tags,
    title,
    status,
    body,
    peekError,
    trySave,
    clearError,
    onCommitClose,
    setError,
    revertField,
  ]);

  return {
    title,
    setTitle,
    status,
    body,
    setBody,
    tags,
    error,
    tagEditorRef: tagEditor.ref,
    handleTitleBlur,
    handleStatusChange,
    handleBodyBlur,
    handleTagsChange,
    handleClose,
  };
}
