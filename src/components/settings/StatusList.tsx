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
    <div className="mb-6">
      <span className="mb-2 block text-sm text-gray-400">Statuses</span>
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
        className="mt-2 w-full rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
      >
        + Add Status
      </button>
    </div>
  );
}

export default StatusList;
