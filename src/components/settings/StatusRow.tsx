import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Button from "../ui/Button";

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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onMoveUp(index)}
        disabled={isFirst}
        aria-label="Move up"
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onMoveDown(index)}
        disabled={isLast}
        aria-label="Move down"
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        color="danger"
        size="sm"
        onClick={() => onRemove(index)}
        aria-label="Remove status"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export default StatusRow;
