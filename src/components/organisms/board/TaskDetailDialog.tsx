import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Heading, Input, Text } from "@/components/atoms";
import { ErrorBanner, IconButton, Select } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";
import type { StatusEntry, Task } from "@/types";

export type TaskDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  statuses: StatusEntry[];
  onSaveTask: (
    taskId: string,
    updates: { title?: string; status?: string; body?: string; order?: number },
  ) => Promise<void>;
};

export function TaskDetailDialog({
  isOpen,
  onClose,
  task,
  statuses,
  onSaveTask,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [body, setBody] = useState(task.body);
  const [error, setError] = useState<string | null>(null);

  const originalRef = useRef({
    title: task.title,
    status: task.status,
    body: task.body,
  });

  useEffect(() => {
    if (isOpen) {
      setTitle(task.title);
      setStatus(task.status);
      setBody(task.body);
      setError(null);
      originalRef.current = {
        title: task.title,
        status: task.status,
        body: task.body,
      };
    }
  }, [isOpen, task]);

  const hasChanged = (field: "title" | "status" | "body", value: string) =>
    value !== originalRef.current[field];

  const save = async (updates: {
    title?: string;
    status?: string;
    body?: string;
    order?: number;
  }) => {
    setError(null);
    try {
      await onSaveTask(task.id, updates);
      if (updates.title !== undefined)
        originalRef.current.title = updates.title;
      if (updates.status !== undefined)
        originalRef.current.status = updates.status;
      if (updates.body !== undefined) originalRef.current.body = updates.body;
    } catch (e) {
      setError(String(e));
    }
  };

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(originalRef.current.title);
      return;
    }
    if (hasChanged("title", trimmed)) {
      save({ title: trimmed });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    if (hasChanged("status", newStatus)) {
      save({ status: newStatus });
    }
  };

  const handleBodyBlur = () => {
    if (hasChanged("body", body)) {
      save({ body });
    }
  };

  const handleClose = async () => {
    const dirtyUpdates: {
      title?: string;
      status?: string;
      body?: string;
      order?: number;
    } = {};
    const trimmed = title.trim();
    if (trimmed && hasChanged("title", trimmed)) dirtyUpdates.title = trimmed;
    if (hasChanged("status", status)) dirtyUpdates.status = status;
    if (hasChanged("body", body)) dirtyUpdates.body = body;

    if (Object.keys(dirtyUpdates).length > 0) {
      try {
        await onSaveTask(task.id, dirtyUpdates);
      } catch (e) {
        toast.error(String(e));
      }
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeAriaLabel="Close"
      containerClassName="max-w-2xl"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <Heading level={2} variant="page">
          Task
        </Heading>
        <IconButton
          icon={<X className="size-4" />}
          aria-label="Close"
          onClick={handleClose}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Text variant="label" size="xs" className="block">
            Title
          </Text>
          <Input
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
            Body
          </Text>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={handleBodyBlur}
            placeholder="Body"
            aria-label="Body"
            rows={8}
            className="min-w-0 flex-1 resize-none rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-sm text-cork-text outline-none transition-colors duration-200 placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30"
          />
        </div>
      </div>
    </Modal>
  );
}
