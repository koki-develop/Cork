import { Plus } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";

import { AutoresizeInput, Heading, Text } from "@/components/atoms";
import { DialogFooter, DialogHeader, FormField, Select, TagEditor } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import { useDialogError } from "@/hooks/ui/useDialogError";
import { useTagEditorController } from "@/hooks/ui/useTagEditorController";
import type { StatusEntry } from "@/types";

export type CreateTaskDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  statuses: StatusEntry[];
  preselectedStatus?: string;
  availableTags?: string[];
  onCreateTask: (title: string, status: string, body: string, tags: string[]) => Promise<void>;
};

export function CreateTaskDialog({
  isOpen,
  onClose,
  statuses,
  preselectedStatus,
  availableTags,
  onCreateTask,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(preselectedStatus ?? statuses[0]?.label ?? "");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const { error, setError, clearError } = useDialogError();
  const tagEditor = useTagEditorController();

  const [confirmingClose, setConfirmingClose] = useState(false);

  const isDirty = title !== "" || body !== "" || tags.length > 0;

  const handleClose = () => {
    if (isDirty && !confirmingClose) {
      setConfirmingClose(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setConfirmingClose(false);
    onClose();
  };

  const handleCancelDiscard = () => {
    setConfirmingClose(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required");
      return;
    }
    clearError();
    const finalTags = tagEditor.flushAndMerge(tags);
    onCreateTask(trimmed, status, body.trim(), finalTags)
      .then(() => {
        onClose();
      })
      .catch((err) => {
        setError(String(err));
      });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      form.requestSubmit();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={confirmingClose ? handleCancelDiscard : handleClose}
        closeAriaLabel="Cancel"
      >
        <DialogHeader title="New Task" onClose={handleClose} closeAriaLabel="Cancel" />

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
          <FormField label="Title" error={error}>
            <AutoresizeInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              data-autofocus
            />
          </FormField>

          <FormField label="Status">
            <Select
              value={status}
              onChange={setStatus}
              options={statuses.map((s) => ({ label: s.label, value: s.label }))}
            />
          </FormField>

          <FormField label="Tags">
            <TagEditor
              ref={tagEditor.ref}
              tags={tags}
              onChange={setTags}
              suggestions={availableTags}
              ariaLabel="Tags"
            />
          </FormField>

          <FormField label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Body (optional)"
              aria-label="Body"
              rows={5}
              className="border-cork-border/40 bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 min-w-0 flex-1 resize-none rounded-lg border px-3 py-1.5 text-sm"
            />
          </FormField>

          <DialogFooter
            onCancel={handleClose}
            action={{
              label: "Create",
              icon: <Plus className="size-3.5" />,
              type: "submit",
            }}
          />
        </form>
      </Modal>

      {confirmingClose && (
        <Modal isOpen={true} onClose={handleCancelDiscard} closeAriaLabel="Keep editing">
          <div className="flex flex-col gap-4">
            <Heading level={2} variant="page">
              Discard changes?
            </Heading>
            <Text size="sm" className="text-cork-muted">
              You have unsaved changes. Are you sure you want to discard them?
            </Text>
            <DialogFooter
              onCancel={handleCancelDiscard}
              cancelLabel="Keep editing"
              action={{
                label: "Discard",
                color: "danger",
                onClick: handleConfirmDiscard,
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
