import { type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Per-window subscription. The backend emits `menu:open-settings` to
// `EventTarget::WebviewWindow { label: <focused> }`, but that target alone
// is not enough to scope delivery — Tauri's matcher
// (`event::listener::match_any_or_filter`) short-circuits to `true` whenever
// the *listener* is registered as `EventTarget::Any`, which is what the
// global `listen()` helper from `@tauri-apps/api/event` does. So a global
// listener would defeat the scoping and pop every window's settings modal.
// Using `getCurrentWebviewWindow().listen` registers as
// `EventTarget::WebviewWindow { label: <this window> }`, which makes the
// backend's `filter_target` check actually run and reject other windows.
export const onOpenSettings = (callback: () => void): Promise<UnlistenFn> =>
  getCurrentWebviewWindow().listen("menu:open-settings", () => callback());

export const onOpenCreateTask = (callback: () => void): Promise<UnlistenFn> =>
  getCurrentWebviewWindow().listen("menu:open-create-task", () => callback());

export const onCheckForUpdates = (callback: () => void): Promise<UnlistenFn> =>
  getCurrentWebviewWindow().listen("menu:check-for-updates", () => callback());
