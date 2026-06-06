import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ContextMenu } from "@/components/molecules";

export type TaskContextMenuState = {
  x: number;
  y: number;
  taskId: string;
};

export type TaskContextMenuProps = {
  state: TaskContextMenuState | null;
  onClose: () => void;
  onDelete: (taskId: string) => void;
};

export function TaskContextMenu({ state, onClose, onDelete }: TaskContextMenuProps) {
  const handleCopyPath = async (taskId: string) => {
    try {
      await navigator.clipboard.writeText(taskId);
      toast.success("Copied path to clipboard");
    } catch {
      toast.error("Failed to copy path to clipboard");
    }
  };

  return (
    <ContextMenu
      position={state ? { x: state.x, y: state.y } : null}
      onClose={onClose}
      items={[
        {
          label: "Copy path",
          icon: <Copy className="size-3.5" />,
          onClick: () => {
            if (state) handleCopyPath(state.taskId);
          },
        },
        {
          label: "Delete",
          icon: <Trash2 className="size-3.5" />,
          color: "danger",
          onClick: () => {
            if (state) onDelete(state.taskId);
          },
        },
      ]}
    />
  );
}
