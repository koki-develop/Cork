import { FolderOpen } from "lucide-react";
import { pickDirectory, setWorkspaceDirectory } from "@/api";
import { WelcomeHero } from "@/components/molecules";
import { WelcomeLayout } from "@/components/templates";

export type WelcomePageProps = {
  onDirectorySelected: (path: string) => void;
};

export function WelcomePage({ onDirectorySelected }: WelcomePageProps) {
  const handleSelect = async () => {
    const path = await pickDirectory();
    if (!path) return;
    try {
      await setWorkspaceDirectory(path);
      onDirectorySelected(path);
    } catch (err) {
      console.error("failed to set workspace directory:", err);
    }
  };

  return (
    <WelcomeLayout>
      <WelcomeHero
        title="Cork"
        subtitle="Kanban board for local Markdown files"
        ctaLabel="Select Workspace Directory"
        ctaIcon={<FolderOpen className="size-4" />}
        onCta={handleSelect}
      />
    </WelcomeLayout>
  );
}
