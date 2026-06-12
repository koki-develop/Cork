import { Plus } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";

import { AutoresizeInput, ErrorBanner, Heading, Text } from "@/components/atoms";
import {
  DateField,
  DialogFooter,
  DialogHeader,
  FormField,
  MarkdownEditor,
  Select,
  TagEditor,
} from "@/components/molecules";
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
  onCreateTask: (
    title: string,
    status: string,
    body: string,
    tags: string[],
    date: string,
  ) => Promise<void>;
  onOpenLink: (url: string) => void;
};

export function CreateTaskDialog({
  isOpen,
  onClose,
  statuses,
  preselectedStatus,
  availableTags,
  onCreateTask,
  onOpenLink,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(preselectedStatus ?? statuses[0]?.label ?? "");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // "" = no due date, mirroring the form's string-based date convention.
  const [date, setDate] = useState("");
  const { error, setError, clearError } = useDialogError();
  const tagEditor = useTagEditorController();

  const [confirmingClose, setConfirmingClose] = useState(false);

  const isDirty = title !== "" || body !== "" || tags.length > 0 || date !== "";

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
    onCreateTask(trimmed, status, body.trim(), finalTags, date)
      .then(() => {
        onClose();
      })
      .catch((err) => {
        setError(String(err));
      });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey && e.key === "Enter") {
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
        maxWidthClassName="max-w-4xl"
        // Trim the panel's left and bottom padding (p-6 → pl-4 / pb-4) so the
        // borderless title and body sit a touch closer to the edges; pl-4 / pb-4
        // sort after p-6 in Tailwind's output so they override only those sides.
        containerClassName="pl-4 pb-4"
      >
        <DialogHeader title="New Task" onClose={handleClose} closeAriaLabel="Cancel" />

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div className="flex flex-col gap-4 md:flex-row md:gap-6">
            <div className="flex min-w-0 flex-col md:flex-1">
              {/* The underline sits on the input, but its left inset comes from
                  this pl-3 wrapper rather than the input's own padding — so the
                  border starts at the first character instead of poking out into
                  the padding. The input keeps pr-3 for its right inset. */}
              <div className="pl-3">
                <AutoresizeInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  aria-label="Title"
                  data-autofocus
                  className="text-cork-text placeholder:text-cork-muted/40 border-cork-border/40 border-b pr-3 pb-3 text-2xl font-bold tracking-tight placeholder:font-normal focus-visible:outline-none"
                />
                {error && <ErrorBanner className="mt-1.5">{error}</ErrorBanner>}
              </div>

              <MarkdownEditor
                initialValue=""
                onChange={setBody}
                onOpenLink={onOpenLink}
                placeholder="Add a description…"
                ariaLabel="Body"
                className="mt-4 min-h-[20rem] flex-1"
              />
            </div>

            <div className="flex flex-col gap-4 md:w-60 md:shrink-0">
              <FormField label="Status">
                <Select
                  value={status}
                  onChange={setStatus}
                  options={statuses.map((s) => ({ label: s.label, value: s.label }))}
                />
              </FormField>

              <FormField label="Date">
                <DateField value={date} onChange={setDate} ariaLabel="Date" />
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

              {/* The action row lives at the bottom of the sidebar (md:mt-auto
                  pins it there) rather than as a full-width row beneath the
                  columns. Right-aligned, it lands in the same bottom-right
                  corner a full-width footer would — but because it no longer
                  forms a row under the Body, the Body fills straight down to
                  the actions instead of leaving an empty band beneath it. */}
              <div className="md:mt-auto">
                <DialogFooter
                  onCancel={handleClose}
                  action={{
                    label: "Create",
                    icon: <Plus className="size-3.5" />,
                    type: "submit",
                  }}
                />
              </div>
            </div>
          </div>
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
