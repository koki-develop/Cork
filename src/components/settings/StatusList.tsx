import { Plus } from "lucide-react";
import type { EditingEntry } from "../../types/settings";
import Button from "../ui/Button";
import StatusRow from "./StatusRow";

type Props = {
  editing: EditingEntry[];
  onLabelChange: (index: number, label: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

function StatusList({
  editing,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAdd,
}: Props) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-xs font-medium text-cork-muted uppercase tracking-wider">
        Statuses
      </span>
      <div className="flex flex-col gap-1.5">
        {editing.map((s, i) => (
          <StatusRow
            key={s._key}
            label={s.label}
            index={i}
            isFirst={i === 0}
            isLast={i === editing.length - 1}
            onLabelChange={onLabelChange}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
          />
        ))}
      </div>
      <Button
        variant="dashed"
        size="md"
        onClick={onAdd}
        className="mt-2 w-full"
      >
        <Plus className="size-3.5" />
        Add Status
      </Button>
    </div>
  );
}

export default StatusList;
