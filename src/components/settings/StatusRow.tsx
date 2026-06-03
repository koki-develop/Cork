type Props = {
  label: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onLabelChange: (index: number, label: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
};

function StatusRow({
  label,
  index,
  isFirst,
  isLast,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(index, e.target.value)}
        className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Status label"
        aria-label={`Status label ${index + 1}`}
      />
      <button
        type="button"
        onClick={() => onMoveUp(index)}
        disabled={isFirst}
        className="rounded p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        aria-label="Move up"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => onMoveDown(index)}
        disabled={isLast}
        className="rounded p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        aria-label="Move down"
      >
        ▼
      </button>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="rounded p-1 text-red-400 hover:text-red-300 transition-colors"
        aria-label="Remove status"
      >
        ✕
      </button>
    </div>
  );
}

export default StatusRow;
