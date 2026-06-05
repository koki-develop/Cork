import { clsx } from "clsx";
import { Settings } from "lucide-react";
import { Text } from "@/components/atoms";
import { IconButton, PathDisplay } from "@/components/molecules";

const isMac = navigator.userAgent.includes("Mac");

export type AppHeaderProps = {
  currentDir: string;
  taskCount: number;
  onOpenSettings: () => void;
};

export function AppHeader({
  currentDir,
  taskCount,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header
      data-tauri-drag-region="deep"
      className={clsx(
        "flex shrink-0 items-center justify-between border-cork-border/50 border-b py-3",
        isMac ? "pl-24 pr-6" : "px-6",
      )}
    >
      <div className="flex items-center gap-3">
        <PathDisplay path={currentDir} />
      </div>
      <div className="flex items-center gap-2">
        <Text variant="muted" size="xs">
          {taskCount} {taskCount === 1 ? "task" : "tasks"}
        </Text>
        <IconButton
          icon={<Settings className="size-4" />}
          aria-label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </header>
  );
}
