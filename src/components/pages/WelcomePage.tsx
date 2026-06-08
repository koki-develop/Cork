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
    await setWorkspaceDirectory(path);
    onDirectorySelected(path);
  };

  return (
    <WelcomeLayout>
      <WelcomeHero
        title="Cork"
        ctaLabel="Select Workspace Directory"
        ctaIcon={<FolderOpen className="size-4" />}
        onCta={handleSelect}
      />
    </WelcomeLayout>
  );
}
