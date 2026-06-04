import { Settings } from "lucide-react";
import { Heading, Text } from "@/components/atoms";
import { IconButton, PathDisplay } from "@/components/molecules";

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
    <header className="flex shrink-0 items-center justify-between border-cork-border/50 border-b px-6 py-3">
      <div className="flex items-center gap-3">
        <Heading level={1} variant="page">
          Cork
        </Heading>
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
