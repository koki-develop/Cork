import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

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
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(index, e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-sm text-cork-text outline-none transition-colors duration-200 placeholder:text-cork-muted/50 focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30"
        placeholder="Status label"
        aria-label={`Status label ${index + 1}`}
      />
      <button
        type="button"
        onClick={() => onMoveUp(index)}
        disabled={isFirst}
        className="rounded-lg p-1.5 text-cork-muted transition-colors duration-200 hover:bg-cork-elevated hover:text-cork-text disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cork-muted cursor-pointer"
        aria-label="Move up"
      >
        <ArrowUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onMoveDown(index)}
        disabled={isLast}
        className="rounded-lg p-1.5 text-cork-muted transition-colors duration-200 hover:bg-cork-elevated hover:text-cork-text disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cork-muted cursor-pointer"
        aria-label="Move down"
      >
        <ArrowDown className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="rounded-lg p-1.5 text-red-400 transition-colors duration-200 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
        aria-label="Remove status"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default StatusRow;
