import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getWorkspaceName, setWorkspaceName } from "@/api";

export function useWorkspaceName(dir: string | null) {
  const [name, setName] = useState("");

  const loadName = useCallback(async () => {
    const result = await getWorkspaceName();
    setName(result ?? "");
  }, []);

  const saveName = useCallback((newName: string) => {
    setName(newName);
    setWorkspaceName(newName).catch((err) => {
      toast.error(`Failed to save workspace name: ${err}`);
    });
  }, []);

  useEffect(() => {
    if (!dir) return;
    loadName();
  }, [dir, loadName]);

  return { name, loadName, saveName };
}
