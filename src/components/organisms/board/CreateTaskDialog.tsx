import { Plus, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { Button, Heading, Input, Text } from "@/components/atoms";
import {
  ErrorBanner,
  IconButton,
  Select,
  TagEditor,
  type TagEditorHandle,
} from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
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
  // State initializes once per mount. BoardPage remounts this dialog (via a
  // `key` bumped on each open), so the form resets to a clean slate without a
  // prop-sync effect.
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(preselectedStatus ?? statuses[0]?.label ?? "");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tagEditorRef = useRef<TagEditorHandle>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required");
      return;
    }
    setError(null);
    const pendingTag = tagEditorRef.current?.flushPending() ?? "";
    const finalTags = pendingTag ? [...tags, pendingTag] : tags;
    onCreateTask(trimmed, status, body.trim(), finalTags)
      .then(() => {
        onClose();
      })
      .catch((err) => {
        setError(String(err));
      });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeAriaLabel="Cancel">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Heading level={2} variant="page">
          New Task
        </Heading>
        <IconButton icon={<X className="size-4" />} aria-label="Cancel" onClick={onClose} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Text variant="label" size="xs" className="block">
            Title
          </Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
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
            onChange={setStatus}
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
            onChange={setTags}
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
            placeholder="Body (optional)"
            aria-label="Body"
            rows={5}
            className="border-cork-border/40 bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-cork-accent/30 min-w-0 flex-1 resize-none rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus:ring-1"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md">
            <Plus className="size-3.5" />
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
