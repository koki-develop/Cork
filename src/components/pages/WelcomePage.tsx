import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { listWorkspaceHistory, pickDirectory, setWorkspaceDirectory } from "@/api";
import { RecentWorkspacesList, WelcomeHero } from "@/components/molecules";
import { WelcomeLayout } from "@/components/templates";

export type WelcomePageProps = {
  onDirectorySelected: (path: string) => void;
};

export function WelcomePage({ onDirectorySelected }: WelcomePageProps) {
  // Start at `[]` so the first paint shows only the hero; the list pops in
  // once `listWorkspaceHistory` resolves with entries.
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    listWorkspaceHistory().then(setHistory);
  }, []);

  const handleSelect = async () => {
    const path = await pickDirectory();
    if (!path) return;
    await setWorkspaceDirectory(path);
    onDirectorySelected(path);
  };

  const handleSelectFromHistory = async (path: string) => {
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
      <RecentWorkspacesList paths={history} onSelect={handleSelectFromHistory} />
    </WelcomeLayout>
  );
}
