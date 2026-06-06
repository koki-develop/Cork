import { useState } from "react";

import { ErrorBanner, Heading, Text } from "@/components/atoms";
import { DialogFooter } from "@/components/molecules";
import { Modal } from "@/components/organisms/shell";

export type DeleteTaskConfirmDialogProps = {
  isOpen: boolean;
  taskTitle: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteTaskConfirmDialog({
  isOpen,
  taskTitle,
  onCancel,
  onConfirm,
}: DeleteTaskConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCancel = () => {
    setError(null);
    onCancel();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      closeAriaLabel="Cancel delete"
      containerClassName="max-w-sm"
    >
      <div className="flex flex-col gap-4">
        <Heading level={2} variant="page">
          Delete task?
        </Heading>
        <Text size="sm" className="text-cork-muted">
          This will permanently delete &ldquo;{taskTitle}&rdquo;. This action cannot be undone.
        </Text>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <DialogFooter
          onCancel={handleCancel}
          cancelVariant="ghost"
          action={{
            label: "Delete",
            color: "danger",
            onClick: handleConfirm,
          }}
        />
      </div>
    </Modal>
  );
}
