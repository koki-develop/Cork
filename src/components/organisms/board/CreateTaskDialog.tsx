import { Plus, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";

import { AutoresizeInput, ErrorBanner, Heading, Text } from "@/components/atoms";
import {
  DateField,
  DialogFooter,
  FormField,
  IconButton,
  MarkdownEditor,
  Select,
  TagEditor,
} from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import { useDialogError } from "@/hooks/ui/useDialogError";
import { useTagEditorController } from "@/hooks/ui/useTagEditorController";
import { isImeKeyEvent } from "@/lib/keyboard";
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

  const bodyRef = useRef<HTMLDivElement>(null);

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
    onCreateTask(trimmed, status, body, finalTags, date)
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
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div className="relative">
            <div className="absolute top-0 right-0 z-10 md:hidden">
              <IconButton
                icon={<X className="size-4" />}
                aria-label="Cancel"
                onClick={handleClose}
                onMouseDown={(e) => e.preventDefault()}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_15rem] md:gap-6">
              <div className="pr-12 pl-3 md:pr-0">
                <AutoresizeInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (isImeKeyEvent(e)) return;
                    if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
                      e.preventDefault();
                      bodyRef.current?.focus();
                    }
                  }}
                  placeholder="Task title"
                  aria-label="Title"
                  data-autofocus
                  className="text-cork-text placeholder:text-cork-muted/40 border-cork-border/40 border-b pr-3 pb-3 text-2xl font-bold tracking-tight placeholder:font-normal focus-visible:outline-none"
                />
                {error && <ErrorBanner className="mt-1.5">{error}</ErrorBanner>}
              </div>

              <MarkdownEditor
                ref={bodyRef}
                initialValue=""
                onChange={setBody}
                onOpenLink={onOpenLink}
                placeholder="Add a description…"
                ariaLabel="Body"
                className="order-1 min-h-[20rem] md:order-none md:col-start-1 md:row-start-2"
              />

              <div className="flex flex-col gap-4 md:col-start-2 md:row-start-1 md:row-end-3">
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

                <div className="hidden md:mt-auto md:block">
                  <DialogFooter
                    onCancel={handleClose}
                    action={{
                      label: "Create",
                      icon: <Plus className="size-3.5" />,
                      type: "submit",
                    }}
                  />
                </div>

                <div className="hidden md:order-first md:flex md:justify-end">
                  <IconButton
                    icon={<X className="size-4" />}
                    aria-label="Cancel"
                    onClick={handleClose}
                    onMouseDown={(e) => e.preventDefault()}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 md:hidden">
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
