import { useEffect, useState } from "react";

import { getWorkspaceDirectory } from "@/api";

export function useCurrentDir() {
  const [dir, setDir] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceDirectory().then((path) => setDir(path));
  }, []);

  return { dir, setDir };
}
