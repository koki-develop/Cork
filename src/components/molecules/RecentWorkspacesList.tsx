import { Text } from "@/components/atoms";

import { PathDisplay } from "./PathDisplay";

export type RecentWorkspacesListProps = {
  paths: string[];
  onSelect: (path: string) => void;
};

export function RecentWorkspacesList({ paths, onSelect }: RecentWorkspacesListProps) {
  if (paths.length === 0) return null;

  return (
    <div className="w-full max-w-md">
      <Text variant="label" size="xs" className="mb-1.5 block">
        Recent Workspaces
      </Text>
      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {paths.map((path) => (
          <li key={path}>
            <PathDisplay
              path={path}
              onClick={() => onSelect(path)}
              aria-label={`Open workspace ${path}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
