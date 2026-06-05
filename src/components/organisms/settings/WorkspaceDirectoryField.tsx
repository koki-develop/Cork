import { Text } from "@/components/atoms";
import { PathDisplay } from "@/components/molecules";

export type WorkspaceDirectoryFieldProps = {
  path: string;
  onPickDirectory: () => void;
};

export function WorkspaceDirectoryField({ path, onPickDirectory }: WorkspaceDirectoryFieldProps) {
  return (
    <div className="mb-5">
      <Text variant="label" size="xs" className="mb-1.5 block">
        Workspace Directory
      </Text>
      <PathDisplay path={path} onClick={onPickDirectory} aria-label="Change workspace directory" />
    </div>
  );
}
