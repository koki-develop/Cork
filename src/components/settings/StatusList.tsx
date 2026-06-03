import { Plus } from "lucide-react";
import type { EditingEntry } from "../../types/settings";
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
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cork-border/40 px-3 py-2 text-xs text-cork-muted transition-colors duration-200 hover:border-cork-border hover:bg-cork-elevated/50 hover:text-cork-text cursor-pointer"
      >
        <Plus className="size-3.5" />
        Add Status
      </button>
    </div>
  );
}

export default StatusList;
