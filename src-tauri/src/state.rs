use crate::error::{CmdResult, CommandError};
use crate::mcp::{McpHandle, McpRuntime, McpStatus};
use crate::task::Task;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

/// (status, order) we last observed for a given task id. Used to detect
/// external status edits — see `task::reconcile_external_status_changes`.
pub type TaskSnapshot = (String, Option<f64>);

/// All AppState entries tied to a single window. Bundling them lets one
/// `Mutex` cover the whole "switch this window's workspace" cascade
/// (`set_workspace` resets `workspace`, `tasks_cache`, *and*
/// `last_reported` together) instead of leaning on three independent locks
/// that a concurrent reader could observe mid-mutation.
#[derive(Default)]
struct WindowState {
    workspace: Option<PathBuf>,
    tasks_cache: Option<Vec<Task>>,
    last_reported: HashMap<String, TaskSnapshot>,
}

/// Process-wide AppState. Per-window slots live in `windows`, keyed by the
/// `WebviewWindow::label()` value of each window, so two windows can hold
/// independent workspaces, caches, and reconciliation snapshots without
/// interfering with each other.
///
/// `next_window_id` feeds `next_window_label` and is never decremented:
/// every new window (Reopen / `File > New Window`) gets a fresh
/// `workspace-<n>` label. The first window created at process start has the
/// fixed label `"main"` (set by `lib.rs::setup`); every other window picks
/// up the next counter value. The `capabilities/default.json` allowlist
/// matches both `"main"` and the `"workspace-*"` glob so this naming
/// convention is the single source of truth.
pub struct AppState {
    windows: Mutex<HashMap<String, WindowState>>,
    next_window_id: AtomicU64,
    /// MCP サーバの稼働状態。プロセス全体に 1 つ (window 単位ではない)。
    /// 詳細は `crate::mcp::McpRuntime` 参照。
    mcp_runtime: Mutex<McpRuntime>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            next_window_id: AtomicU64::new(0),
            mcp_runtime: Mutex::new(McpRuntime::Stopped),
        }
    }

    pub fn workspace(&self, label: &str) -> Option<PathBuf> {
        self.windows
            .lock()
            .unwrap()
            .get(label)
            .and_then(|s| s.workspace.clone())
    }

    pub fn require_workspace(&self, label: &str) -> CmdResult<PathBuf> {
        self.workspace(label).ok_or(CommandError::NoWorkspace)
    }

    /// Replace the workspace for one window and clear its caches in the
    /// same lock acquisition. The single-`Mutex` design here is what
    /// guarantees the cascade is atomic — a reader on the same window can
    /// never observe "new workspace, stale cache" — and it keeps the
    /// blast radius limited to the named label, leaving other windows
    /// untouched. This is the multi-window counterpart of the original
    /// "globally clear the cache on workspace switch" behaviour.
    pub fn set_workspace(&self, label: &str, dir: PathBuf) {
        let mut all = self.windows.lock().unwrap();
        let entry = all.entry(label.to_string()).or_default();
        entry.workspace = Some(dir);
        entry.tasks_cache = None;
        entry.last_reported.clear();
    }

    pub fn get_cached_tasks(&self, label: &str) -> Option<Vec<Task>> {
        self.windows
            .lock()
            .unwrap()
            .get(label)
            .and_then(|s| s.tasks_cache.clone())
    }

    pub fn set_cached_tasks(&self, label: &str, tasks: Vec<Task>) {
        self.windows
            .lock()
            .unwrap()
            .entry(label.to_string())
            .or_default()
            .tasks_cache = Some(tasks);
    }

    pub fn invalidate_cache(&self, label: &str) {
        if let Some(state) = self.windows.lock().unwrap().get_mut(label) {
            state.tasks_cache = None;
        }
    }

    pub fn get_last_reported(&self, label: &str) -> HashMap<String, TaskSnapshot> {
        self.windows
            .lock()
            .unwrap()
            .get(label)
            .map(|s| s.last_reported.clone())
            .unwrap_or_default()
    }

    /// Replace the per-window last-reported snapshot with the (id → status,
    /// order) of the given tasks. Always called by
    /// `reconcile_external_status_changes` after reconciliation completes (so
    /// the snapshot matches the on-disk state at that point). The snapshot is
    /// the baseline subsequent reconciliations diff against.
    pub fn set_last_reported(&self, label: &str, tasks: &[Task]) {
        let mut all = self.windows.lock().unwrap();
        let entry = all.entry(label.to_string()).or_default();
        entry.last_reported.clear();
        entry.last_reported.reserve(tasks.len());
        for task in tasks {
            entry
                .last_reported
                .insert(task.id.clone(), (task.status.clone(), task.order));
        }
    }

    /// Populate the per-window snapshot only if it is currently empty. Used
    /// by `list_tasks` to seed the baseline at session start (or after a
    /// workspace switch clears state); subsequent `list_tasks` calls must
    /// NOT touch the snapshot because doing so would let an internal write
    /// that races a fresh disk read silently absorb a concurrent external
    /// edit — the snapshot would inherit the post-edit state and the next
    /// reconciliation would see no diff to repair.
    pub fn seed_last_reported_if_empty(&self, label: &str, tasks: &[Task]) {
        let mut all = self.windows.lock().unwrap();
        let entry = all.entry(label.to_string()).or_default();
        if !entry.last_reported.is_empty() {
            return;
        }
        entry.last_reported.reserve(tasks.len());
        for task in tasks {
            entry
                .last_reported
                .insert(task.id.clone(), (task.status.clone(), task.order));
        }
    }

    /// Update one entry of the per-window snapshot — called by every
    /// internal write command immediately after writing the .md file.
    /// Keeping the snapshot in lockstep with our own writes is what lets
    /// reconciliation cleanly distinguish an external edit from the
    /// lingering side-effects of an earlier internal mutation: without it,
    /// an external edit that lands while the previous internal write is
    /// still propagating through the watcher debounce window would be
    /// misdiagnosed as an internal change (because the snapshot would still
    /// hold the pre-internal-write status) and slip past reconciliation.
    pub fn upsert_last_reported(
        &self,
        label: &str,
        id: String,
        status: String,
        order: Option<f64>,
    ) {
        self.windows
            .lock()
            .unwrap()
            .entry(label.to_string())
            .or_default()
            .last_reported
            .insert(id, (status, order));
    }

    pub fn remove_last_reported(&self, label: &str, id: &str) {
        if let Some(state) = self.windows.lock().unwrap().get_mut(label) {
            state.last_reported.remove(id);
        }
    }

    /// Drop the entire `WindowState` for a closed window. Called from the
    /// `WindowEvent::Destroyed` handler in `lib.rs` so the map doesn't grow
    /// indefinitely across an interactive session that opens and closes
    /// many windows. `Destroyed` (not `CloseRequested`) is the right
    /// signal because `CloseRequested` can be cancelled by
    /// `prevent_close()`, and cleaning state for a window that's about to
    /// keep living would break the next command issued from it.
    pub fn remove_window(&self, label: &str) {
        self.windows.lock().unwrap().remove(label);
    }

    /// Mint a fresh, never-reused window label of the form `workspace-<n>`.
    /// Used by the menu's `New Window` handler and the macOS Dock-reopen
    /// path. The counter is monotonic for the lifetime of the process —
    /// closing a window does not free its label, which keeps the
    /// `["main", "workspace-*"]` capability wildcard match unambiguous and
    /// prevents AppState entries from a previously-closed window
    /// accidentally bleeding into a newly-opened one.
    pub fn next_window_label(&self) -> String {
        let n = self.next_window_id.fetch_add(1, Ordering::Relaxed) + 1;
        format!("workspace-{n}")
    }

    // -- MCP runtime ----------------------------------------------------------

    pub fn set_mcp_runtime(&self, runtime: McpRuntime) {
        *self.mcp_runtime.lock().unwrap() = runtime;
    }

    /// Atomically take the handle out of a `Running` runtime and reset to
    /// `Stopped`, so stop+restart is one operation. Non-`Running` variants
    /// (`Stopped`, `Failed`) are preserved so a Failed-state error doesn't
    /// disappear when a caller probes for a handle.
    pub fn take_mcp_handle(&self) -> Option<McpHandle> {
        let mut guard = self.mcp_runtime.lock().unwrap();
        let taken = std::mem::replace(&mut *guard, McpRuntime::Stopped);
        match taken {
            McpRuntime::Running(handle) => Some(handle),
            other => {
                *guard = other;
                None
            }
        }
    }

    pub fn mcp_status(&self) -> McpStatus {
        self.mcp_runtime.lock().unwrap().to_status()
    }

    /// Lightweight predicate for the `update_settings` diff branch — answers
    /// "is the server live right now?" without taking the handle (which
    /// `with_mcp_handle(|_| ()).is_some()` would also do, but reads
    /// awkwardly at the callsite).
    pub fn is_mcp_running(&self) -> bool {
        matches!(*self.mcp_runtime.lock().unwrap(), McpRuntime::Running(_))
    }

    /// Borrow the live handle for in-place mutation (token hot-swap) without
    /// stopping the server. Returns `None` and skips the closure for any
    /// non-`Running` runtime.
    pub fn with_mcp_handle<R>(&self, f: impl FnOnce(&McpHandle) -> R) -> Option<R> {
        let guard = self.mcp_runtime.lock().unwrap();
        if let McpRuntime::Running(h) = &*guard {
            Some(f(h))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    const MAIN: &str = "main";
    const W1: &str = "workspace-1";

    #[test]
    fn new_starts_empty() {
        let state = AppState::new();
        assert!(state.workspace(MAIN).is_none());
        assert!(matches!(
            state.require_workspace(MAIN),
            Err(CommandError::NoWorkspace)
        ));
    }

    #[test]
    fn set_then_get_round_trips() {
        let state = AppState::new();
        let dir = PathBuf::from("/tmp/cork-test");
        state.set_workspace(MAIN, dir.clone());
        assert_eq!(state.workspace(MAIN), Some(dir.clone()));
        assert_eq!(state.require_workspace(MAIN).unwrap(), dir);
    }

    #[test]
    fn set_replaces_previous_value_for_same_label() {
        let state = AppState::new();
        state.set_workspace(MAIN, PathBuf::from("/tmp/a"));
        state.set_workspace(MAIN, PathBuf::from("/tmp/b"));
        assert_eq!(state.workspace(MAIN), Some(PathBuf::from("/tmp/b")));
    }

    #[test]
    fn workspace_returns_clone_not_reference() {
        // Calling workspace() must not hold the lock — verified by acquiring it
        // again immediately and by the type itself (PathBuf is owned).
        let state = AppState::new();
        state.set_workspace(MAIN, PathBuf::from("/tmp/clone-check"));
        let first = state.workspace(MAIN).unwrap();
        let second = state.workspace(MAIN).unwrap();
        assert_eq!(first, second);
        // After borrowing first, set should still work (no live guard).
        state.set_workspace(MAIN, PathBuf::from("/tmp/after"));
        assert_eq!(state.workspace(MAIN).unwrap(), PathBuf::from("/tmp/after"));
    }

    fn make_task(id: &str, status: &str, order: Option<f64>) -> Task {
        Task {
            id: id.to_string(),
            title: "t".to_string(),
            status: status.to_string(),
            body: String::new(),
            order,
            tags: Vec::new(),
            date: None,
        }
    }

    #[test]
    fn last_reported_starts_empty() {
        let state = AppState::new();
        assert!(state.get_last_reported(MAIN).is_empty());
    }

    #[test]
    fn set_last_reported_replaces_previous_snapshot() {
        let state = AppState::new();
        state.set_last_reported(MAIN, &[make_task("a", "Todo", Some(0.0))]);
        let first = state.get_last_reported(MAIN);
        assert_eq!(first.get("a"), Some(&("Todo".to_string(), Some(0.0))));

        state.set_last_reported(
            MAIN,
            &[
                make_task("b", "Doing", Some(-1.0)),
                make_task("c", "Done", None),
            ],
        );
        let second = state.get_last_reported(MAIN);
        assert!(!second.contains_key("a"));
        assert_eq!(second.get("b"), Some(&("Doing".to_string(), Some(-1.0))));
        assert_eq!(second.get("c"), Some(&("Done".to_string(), None)));
    }

    #[test]
    fn seed_last_reported_populates_when_empty() {
        let state = AppState::new();
        state.seed_last_reported_if_empty(MAIN, &[make_task("a", "Todo", Some(0.0))]);
        assert_eq!(
            state.get_last_reported(MAIN).get("a"),
            Some(&("Todo".to_string(), Some(0.0)))
        );
    }

    #[test]
    fn seed_last_reported_is_no_op_when_already_populated() {
        // Race-condition guard: seeding from a fresh disk read after an
        // internal write would absorb a concurrent external edit into the
        // baseline, hiding the diff from the next reconciliation. The seed
        // is only allowed to fire when the snapshot has never been
        // populated since the last workspace switch.
        let state = AppState::new();
        state.set_last_reported(MAIN, &[make_task("a", "Todo", Some(0.0))]);
        state.seed_last_reported_if_empty(MAIN, &[make_task("a", "Doing", Some(5.0))]);
        assert_eq!(
            state.get_last_reported(MAIN).get("a"),
            Some(&("Todo".to_string(), Some(0.0)))
        );
    }

    #[test]
    fn get_last_reported_returns_clone() {
        // Mirrors the workspace() / get_cached_tasks() contract: the call
        // must not hold the lock past return. Verified by snapshotting,
        // mutating via the API, and confirming the snapshot is unaffected.
        let state = AppState::new();
        state.set_last_reported(MAIN, &[make_task("a", "Todo", Some(0.0))]);
        let snapshot = state.get_last_reported(MAIN);
        state.set_last_reported(MAIN, &[make_task("a", "Doing", Some(-1.0))]);
        assert_eq!(snapshot.get("a"), Some(&("Todo".to_string(), Some(0.0))));
    }

    #[test]
    fn shared_across_threads_via_arc() {
        let state = Arc::new(AppState::new());

        let writers: Vec<_> = (0..8)
            .map(|i| {
                let state = Arc::clone(&state);
                thread::spawn(move || {
                    state.set_workspace(MAIN, PathBuf::from(format!("/tmp/w{i}")));
                })
            })
            .collect();
        for w in writers {
            w.join().unwrap();
        }

        // After the contention, exactly one of the writes wins; the value must
        // be one of the ones we set and never None.
        let got = state.workspace(MAIN).expect("some writer must have won");
        let s = got.to_string_lossy();
        assert!(s.starts_with("/tmp/w") && s.len() == 7, "unexpected value: {got:?}");
    }

    // --- per-window isolation -------------------------------------------------

    #[test]
    fn workspaces_are_isolated_by_label() {
        let state = AppState::new();
        state.set_workspace(MAIN, PathBuf::from("/tmp/A"));
        state.set_workspace(W1, PathBuf::from("/tmp/B"));

        assert_eq!(state.workspace(MAIN), Some(PathBuf::from("/tmp/A")));
        assert_eq!(state.workspace(W1), Some(PathBuf::from("/tmp/B")));

        // Mutating one label leaves the other untouched.
        state.set_workspace(MAIN, PathBuf::from("/tmp/C"));
        assert_eq!(state.workspace(MAIN), Some(PathBuf::from("/tmp/C")));
        assert_eq!(state.workspace(W1), Some(PathBuf::from("/tmp/B")));
    }

    #[test]
    fn tasks_cache_is_isolated_by_label() {
        let state = AppState::new();
        let main_tasks = vec![make_task("m", "Todo", Some(0.0))];
        let w1_tasks = vec![
            make_task("a", "Doing", Some(1.0)),
            make_task("b", "Done", Some(2.0)),
        ];

        state.set_cached_tasks(MAIN, main_tasks.clone());
        state.set_cached_tasks(W1, w1_tasks.clone());

        assert_eq!(state.get_cached_tasks(MAIN).unwrap().len(), 1);
        assert_eq!(state.get_cached_tasks(W1).unwrap().len(), 2);

        state.invalidate_cache(MAIN);
        assert!(state.get_cached_tasks(MAIN).is_none());
        // W1 unaffected.
        assert_eq!(state.get_cached_tasks(W1).unwrap().len(), 2);
    }

    #[test]
    fn last_reported_is_isolated_by_label() {
        let state = AppState::new();
        state.set_last_reported(MAIN, &[make_task("a", "Todo", Some(0.0))]);
        state.upsert_last_reported(W1, "b".to_string(), "Doing".to_string(), Some(1.0));

        let main = state.get_last_reported(MAIN);
        let w1 = state.get_last_reported(W1);

        assert_eq!(main.get("a"), Some(&("Todo".to_string(), Some(0.0))));
        assert!(!main.contains_key("b"));
        assert_eq!(w1.get("b"), Some(&("Doing".to_string(), Some(1.0))));
        assert!(!w1.contains_key("a"));
    }

    // --- remove_window --------------------------------------------------------

    #[test]
    fn remove_window_clears_all_window_state() {
        let state = AppState::new();
        state.set_workspace(W1, PathBuf::from("/tmp/B"));
        state.set_cached_tasks(W1, vec![make_task("a", "Todo", Some(0.0))]);
        state.upsert_last_reported(W1, "a".to_string(), "Todo".to_string(), Some(0.0));

        // Also seed another label so we can confirm removal is scoped.
        state.set_workspace(MAIN, PathBuf::from("/tmp/A"));
        state.set_cached_tasks(MAIN, vec![make_task("m", "Done", None)]);
        state.upsert_last_reported(MAIN, "m".to_string(), "Done".to_string(), None);

        state.remove_window(W1);

        assert!(state.workspace(W1).is_none());
        assert!(state.get_cached_tasks(W1).is_none());
        assert!(state.get_last_reported(W1).is_empty());

        // MAIN should be intact.
        assert_eq!(state.workspace(MAIN), Some(PathBuf::from("/tmp/A")));
        assert_eq!(state.get_cached_tasks(MAIN).unwrap().len(), 1);
        assert_eq!(
            state.get_last_reported(MAIN).get("m"),
            Some(&("Done".to_string(), None))
        );
    }

    #[test]
    fn remove_window_is_no_op_for_unknown_label() {
        let state = AppState::new();
        state.set_workspace(MAIN, PathBuf::from("/tmp/A"));

        state.remove_window("never-existed");

        assert_eq!(state.workspace(MAIN), Some(PathBuf::from("/tmp/A")));
    }

    // --- next_window_label ----------------------------------------------------

    #[test]
    fn next_window_label_is_monotonic() {
        let state = AppState::new();
        assert_eq!(state.next_window_label(), "workspace-1");
        assert_eq!(state.next_window_label(), "workspace-2");
        assert_eq!(state.next_window_label(), "workspace-3");
    }

    #[test]
    fn next_window_label_is_unique_across_threads() {
        // Concurrent callers must each receive a distinct label; the
        // `AtomicU64` guarantees no duplicates even when several Reopen /
        // New Window events fire in close succession.
        let state = Arc::new(AppState::new());
        let n = 32;
        let handles: Vec<_> = (0..n)
            .map(|_| {
                let s = Arc::clone(&state);
                thread::spawn(move || s.next_window_label())
            })
            .collect();
        let mut labels: Vec<String> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        labels.sort();
        labels.dedup();
        assert_eq!(labels.len(), n);
        for label in &labels {
            assert!(label.starts_with("workspace-"), "unexpected label {label}");
        }
    }

    #[test]
    fn next_window_label_continues_after_window_removed() {
        // Closing a window must not free its label number: the counter is
        // strictly monotonic across the entire process lifetime so a
        // late-arriving Reopen can't be confused with an earlier closed
        // window's leftover state.
        let state = AppState::new();
        let first = state.next_window_label();
        let second = state.next_window_label();
        state.remove_window(&first);
        let third = state.next_window_label();
        assert_eq!(first, "workspace-1");
        assert_eq!(second, "workspace-2");
        assert_eq!(third, "workspace-3");
    }

    // --- set_workspace scoping invariant -------------------------------------

    #[test]
    fn set_workspace_only_resets_target_label_caches() {
        let state = AppState::new();

        // Both labels primed.
        state.set_workspace(MAIN, PathBuf::from("/tmp/A"));
        state.set_cached_tasks(MAIN, vec![make_task("m", "Todo", Some(0.0))]);
        state.upsert_last_reported(MAIN, "m".to_string(), "Todo".to_string(), Some(0.0));
        state.set_workspace(W1, PathBuf::from("/tmp/B"));
        state.set_cached_tasks(W1, vec![make_task("w", "Doing", Some(1.0))]);
        state.upsert_last_reported(W1, "w".to_string(), "Doing".to_string(), Some(1.0));

        // Re-set MAIN's workspace — MAIN's cache and last_reported clear;
        // W1's are untouched.
        state.set_workspace(MAIN, PathBuf::from("/tmp/A2"));

        assert!(state.get_cached_tasks(MAIN).is_none());
        assert!(state.get_last_reported(MAIN).is_empty());
        assert_eq!(state.get_cached_tasks(W1).unwrap().len(), 1);
        assert_eq!(
            state.get_last_reported(W1).get("w"),
            Some(&("Doing".to_string(), Some(1.0)))
        );
    }

    #[test]
    fn many_windows_can_coexist() {
        let state = AppState::new();
        for i in 0..16 {
            let label = state.next_window_label();
            state.set_workspace(&label, PathBuf::from(format!("/tmp/w{i}")));
            state.set_cached_tasks(&label, vec![make_task(&format!("id-{i}"), "Todo", None)]);
        }
        // Every minted label retains its own per-window state in parallel.
        for i in 0..16 {
            let label = format!("workspace-{}", i + 1);
            assert_eq!(
                state.workspace(&label),
                Some(PathBuf::from(format!("/tmp/w{i}")))
            );
            assert_eq!(
                state.get_cached_tasks(&label).unwrap()[0].id,
                format!("id-{i}")
            );
        }
    }

    #[test]
    fn workspace_returns_none_for_unknown_label() {
        let state = AppState::new();
        state.set_workspace(MAIN, PathBuf::from("/tmp/A"));
        assert!(state.workspace("never-existed").is_none());
        assert!(matches!(
            state.require_workspace("never-existed"),
            Err(CommandError::NoWorkspace)
        ));
    }

    // -- MCP runtime ----------------------------------------------------------

    #[test]
    fn mcp_runtime_starts_stopped() {
        let state = AppState::new();
        assert_eq!(state.mcp_status(), McpStatus::Stopped);
    }

    #[test]
    fn mcp_runtime_take_handle_returns_none_when_stopped() {
        let state = AppState::new();
        assert!(state.take_mcp_handle().is_none());
    }

    #[test]
    fn mcp_runtime_failed_state_surfaces_in_status() {
        let state = AppState::new();
        state.set_mcp_runtime(McpRuntime::Failed {
            error: "Port 8569 in use".to_string(),
        });
        assert_eq!(
            state.mcp_status(),
            McpStatus::Failed { error: "Port 8569 in use".to_string() }
        );
        assert!(state.take_mcp_handle().is_none(), "Failed state must not yield a handle");
        // After a failed take_mcp_handle, the state must still report Failed
        // — taking only consumes Running.
        assert_eq!(
            state.mcp_status(),
            McpStatus::Failed { error: "Port 8569 in use".to_string() }
        );
    }

    #[test]
    fn mcp_runtime_with_mcp_handle_returns_none_when_not_running() {
        let state = AppState::new();
        let called = std::cell::Cell::new(false);
        let result = state.with_mcp_handle(|_h| {
            called.set(true);
        });
        assert!(result.is_none());
        assert!(!called.get(), "callback must not run when not Running");
    }

    #[test]
    fn is_mcp_running_matches_runtime_variant() {
        // The `update_settings` diff branch swings on this predicate (token
        // hot-swap vs. full restart), so the Stopped / Failed / Running
        // transitions need explicit coverage even though the body is a
        // one-line `matches!`.
        use crate::mcp::McpHandle;
        use std::sync::{Arc, RwLock};
        use tokio_util::sync::CancellationToken;

        let state = AppState::new();
        assert!(!state.is_mcp_running(), "Stopped → false");

        state.set_mcp_runtime(McpRuntime::Failed {
            error: "Port 8569 in use".to_string(),
        });
        assert!(!state.is_mcp_running(), "Failed → false");

        // Build a real McpHandle in a current-thread runtime so the Running
        // arm is exercised end-to-end (same shape as
        // `mcp_runtime_status_running` in mcp.rs).
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let handle = rt.block_on(async {
            let cancel = CancellationToken::new();
            let cancel_clone = cancel.clone();
            let join = tokio::spawn(async move { cancel_clone.cancelled().await });
            McpHandle {
                cancel,
                join,
                token: Arc::new(RwLock::new("tok123456789012".to_string())),
                port: 9001,
            }
        });
        state.set_mcp_runtime(McpRuntime::Running(handle));
        assert!(state.is_mcp_running(), "Running → true");
    }
}
