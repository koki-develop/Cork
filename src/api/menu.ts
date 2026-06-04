import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const onOpenSettings = (callback: () => void): Promise<UnlistenFn> =>
  listen("menu:open-settings", () => callback());
