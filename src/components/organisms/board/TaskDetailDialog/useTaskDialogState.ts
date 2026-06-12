import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { useDebouncedCallback } from "@/hooks/ui/useDebouncedCallback";
import { useFieldError } from "@/hooks/ui/useFieldError";
import { useTagEditorController } from "@/hooks/ui/useTagEditorController";
import {
  computeDirtyUpdates,
  type TaskFormSnapshot,
  taskFormSnapshot,
  withTaskUpdates,
} from "@/lib/task";
import type { Task, TaskUpdates } from "@/types";

type FieldKey = keyof TaskUpdates;

/**
 * Quiet window before the body autosaves while typing. Long enough that a
 * normal typing cadence doesn't fire a write per keystroke, short enough that
 * an edit is on disk almost as soon as the user pauses — so an abrupt quit
 * (Cmd+Q without blurring) loses at most this much, instead of the whole edit.
 */
const BODY_SAVE_DEBOUNCE_MS = 500;

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
    date: field === "date" ? original.date : snapshot.date,
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
 * - per-field auto-save (blur for title; debounced-while-typing for body;
 *   change for status/tags),
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
  // Held as a string ("" = no due date) to mirror `tags`; seeded from the
  // task's `date: string | null` via the snapshot's null→"" mapping.
  const [date, setDate] = useState<string>(task.date ?? "");

  // Dirty-tracking baseline initialized once per mount from the freshly-
  // fetched task; BoardPage remounts via a `key` bump on each open, so this
  // re-seeds without a prop-sync effect. Successful saves keep it current.
  const originalRef = useRef<TaskFormSnapshot>(taskFormSnapshot(task));

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
      case "date":
        setDate(originalRef.current.date);
        return;
    }
  }, []);

  // Serializes saves so writes land in the order they were issued. The body
  // debounce and the blur flush can both fire a save within one in-flight
  // window; without a queue they'd race in `onSaveTask` and could land out of
  // order, letting an older body silently overwrite a newer one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const trySave = useCallback(
    (updates: TaskUpdates): Promise<TrySaveResult> => {
      const result = saveChainRef.current.then(async (): Promise<TrySaveResult> => {
        try {
          await onSaveTask(task.id, updates);
          originalRef.current = withTaskUpdates(originalRef.current, updates);
          return { ok: true };
        } catch (e) {
          return { ok: false, message: String(e) };
        }
      });
      // The chain stays rejection-free (failures resolve to `{ ok: false }`),
      // so one failed save can't wedge every later one.
      saveChainRef.current = result.then(() => undefined);
      return result;
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

  // Body autosaves while the user types (debounced) rather than only on blur,
  // so an unblurred quit doesn't drop the edit. The latest text is passed as an
  // arg so the trailing call never reads a stale `body` closure.
  const debouncedSaveBody = useDebouncedCallback((next: string) => {
    if (next !== originalRef.current.body) {
      void autoSave("body", { body: next });
    }
  }, BODY_SAVE_DEBOUNCE_MS);

  const handleBodyChange = useCallback(
    (next: string) => {
      setBody(next);
      debouncedSaveBody(next);
    },
    [debouncedSaveBody],
  );

  // Blur flushes the pending debounce so leaving the field persists at once
  // instead of waiting out the quiet window.
  const handleBodyBlur = useCallback(() => {
    debouncedSaveBody.flush();
  }, [debouncedSaveBody]);

  const handleTagsChange = useCallback(
    (next: string[]) => {
      setTags(next);
      const dirty = computeDirtyUpdates(originalRef.current, {
        ...originalRef.current,
        tags: next,
      });
      if (dirty.tags !== undefined) {
        void autoSave("tags", { tags: next });
      }
    },
    [autoSave],
  );

  const handleDateChange = useCallback(
    (next: string) => {
      setDate(next);
      const dirty = computeDirtyUpdates(originalRef.current, {
        ...originalRef.current,
        date: next,
      });
      if (dirty.date !== undefined) {
        void autoSave("date", { date: next });
      }
    },
    [autoSave],
  );

  const handleClose = useCallback(async () => {
    if (isLocked) return;

    // Close takes over body persistence: its dirty diff already covers the
    // latest body, so drop any in-flight debounce to avoid a redundant write.
    debouncedSaveBody.cancel();

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
      date,
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
    date,
    peekError,
    trySave,
    clearError,
    onCommitClose,
    setError,
    revertField,
    debouncedSaveBody,
  ]);

  return {
    title,
    setTitle,
    status,
    body,
    tags,
    date,
    handleDateChange,
    error,
    tagEditorRef: tagEditor.ref,
    handleTitleBlur,
    handleStatusChange,
    handleBodyChange,
    handleBodyBlur,
    handleTagsChange,
    handleClose,
  };
}
