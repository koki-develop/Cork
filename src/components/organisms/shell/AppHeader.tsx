import { Settings } from "lucide-react";

import { Text } from "@/components/atoms";
import { IconButton, PathDisplay } from "@/components/molecules";

export type AppHeaderProps = {
  currentDir: string;
  taskCount: number;
  onOpenSettings: () => void;
};

export function AppHeader({ currentDir, taskCount, onOpenSettings }: AppHeaderProps) {
  return (
    <header
      data-tauri-drag-region="deep"
      className="border-cork-border/50 relative z-[55] flex shrink-0 items-center justify-between gap-4 border-b py-3 pr-6 pl-24"
    >
      <div className="flex min-w-0 items-center gap-3">
        <PathDisplay path={currentDir} />
      </div>
      <div className="flex items-center gap-2">
        <Text variant="muted" size="xs" className="whitespace-nowrap">
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
