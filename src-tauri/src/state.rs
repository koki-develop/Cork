use crate::error::{CmdResult, CommandError};
use crate::task::Task;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// (status, order) we last observed for a given task id. Used to detect
/// external status edits — see `task::reconcile_external_status_changes`.
pub type TaskSnapshot = (String, Option<f64>);

pub struct AppState {
    workspace_dir: Mutex<Option<PathBuf>>,
    tasks_cache: Mutex<Option<Vec<Task>>>,
    last_reported: Mutex<HashMap<String, TaskSnapshot>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspace_dir: Mutex::new(None),
            tasks_cache: Mutex::new(None),
            last_reported: Mutex::new(HashMap::new()),
        }
    }

    pub fn workspace(&self) -> Option<PathBuf> {
        self.workspace_dir.lock().unwrap().clone()
    }

    pub fn require_workspace(&self) -> CmdResult<PathBuf> {
        self.workspace().ok_or(CommandError::NoWorkspace)
    }

    pub fn set_workspace(&self, dir: PathBuf) {
        *self.workspace_dir.lock().unwrap() = Some(dir);
        *self.tasks_cache.lock().unwrap() = None;
        self.last_reported.lock().unwrap().clear();
    }

    pub fn get_cached_tasks(&self) -> Option<Vec<Task>> {
        self.tasks_cache.lock().unwrap().clone()
    }

    pub fn set_cached_tasks(&self, tasks: Vec<Task>) {
        *self.tasks_cache.lock().unwrap() = Some(tasks);
    }

    pub fn invalidate_cache(&self) {
        *self.tasks_cache.lock().unwrap() = None;
    }

    pub fn get_last_reported(&self) -> HashMap<String, TaskSnapshot> {
        self.last_reported.lock().unwrap().clone()
    }

    /// Replace the last-reported snapshot with the (id → status, order) of
    /// the given tasks. Always called by `reconcile_external_status_changes`
    /// after reconciliation completes (so the snapshot matches the on-disk
    /// state at that point). The snapshot is the baseline subsequent
    /// reconciliations diff against.
    pub fn set_last_reported(&self, tasks: &[Task]) {
        let mut snapshot = self.last_reported.lock().unwrap();
        snapshot.clear();
        snapshot.reserve(tasks.len());
        for task in tasks {
            snapshot.insert(task.id.clone(), (task.status.clone(), task.order));
        }
    }

    /// Populate the snapshot only if it is currently empty. Used by
    /// `list_tasks` to seed the baseline at session start (or after a
    /// workspace switch clears state); subsequent `list_tasks` calls must
    /// NOT touch the snapshot because doing so would let an internal write
    /// that races a fresh disk read silently absorb a concurrent external
    /// edit — the snapshot would inherit the post-edit state and the next
    /// reconciliation would see no diff to repair.
    pub fn seed_last_reported_if_empty(&self, tasks: &[Task]) {
        let mut snapshot = self.last_reported.lock().unwrap();
        if !snapshot.is_empty() {
            return;
        }
        snapshot.reserve(tasks.len());
        for task in tasks {
            snapshot.insert(task.id.clone(), (task.status.clone(), task.order));
        }
    }

    /// Update one entry of the snapshot — called by every internal write
    /// command immediately after writing the .md file. Keeping the snapshot
    /// in lockstep with our own writes is what lets reconciliation cleanly
    /// distinguish an external edit from the lingering side-effects of an
    /// earlier internal mutation: without it, an external edit that lands
    /// while the previous internal write is still propagating through the
    /// watcher debounce window would be misdiagnosed as an internal change
    /// (because the snapshot would still hold the pre-internal-write
    /// status) and slip past reconciliation.
    pub fn upsert_last_reported(&self, id: String, status: String, order: Option<f64>) {
        self.last_reported
            .lock()
            .unwrap()
            .insert(id, (status, order));
    }

    pub fn remove_last_reported(&self, id: &str) {
        self.last_reported.lock().unwrap().remove(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn new_starts_empty() {
        let state = AppState::new();
        assert!(state.workspace().is_none());
        assert!(matches!(
            state.require_workspace(),
            Err(CommandError::NoWorkspace)
        ));
    }

    #[test]
    fn set_then_get_round_trips() {
        let state = AppState::new();
        let dir = PathBuf::from("/tmp/cork-test");
        state.set_workspace(dir.clone());
        assert_eq!(state.workspace(), Some(dir.clone()));
        assert_eq!(state.require_workspace().unwrap(), dir);
    }

    #[test]
    fn set_replaces_previous_value() {
        let state = AppState::new();
        state.set_workspace(PathBuf::from("/tmp/a"));
        state.set_workspace(PathBuf::from("/tmp/b"));
        assert_eq!(state.workspace(), Some(PathBuf::from("/tmp/b")));
    }

    #[test]
    fn workspace_returns_clone_not_reference() {
        // Calling workspace() must not hold the lock — verified by acquiring it
        // again immediately and by the type itself (PathBuf is owned).
        let state = AppState::new();
        state.set_workspace(PathBuf::from("/tmp/clone-check"));
        let first = state.workspace().unwrap();
        let second = state.workspace().unwrap();
        assert_eq!(first, second);
        // After borrowing first, set should still work (no live guard).
        state.set_workspace(PathBuf::from("/tmp/after"));
        assert_eq!(state.workspace().unwrap(), PathBuf::from("/tmp/after"));
    }

    fn make_task(id: &str, status: &str, order: Option<f64>) -> Task {
        Task {
            id: id.to_string(),
            title: "t".to_string(),
            status: status.to_string(),
            body: String::new(),
            order,
            tags: Vec::new(),
        }
    }

    #[test]
    fn last_reported_starts_empty() {
        let state = AppState::new();
        assert!(state.get_last_reported().is_empty());
    }

    #[test]
    fn set_last_reported_replaces_previous_snapshot() {
        let state = AppState::new();
        state.set_last_reported(&[make_task("a", "Todo", Some(0.0))]);
        let first = state.get_last_reported();
        assert_eq!(first.get("a"), Some(&("Todo".to_string(), Some(0.0))));

        state.set_last_reported(&[
            make_task("b", "Doing", Some(-1.0)),
            make_task("c", "Done", None),
        ]);
        let second = state.get_last_reported();
        assert!(!second.contains_key("a"));
        assert_eq!(second.get("b"), Some(&("Doing".to_string(), Some(-1.0))));
        assert_eq!(second.get("c"), Some(&("Done".to_string(), None)));
    }

    #[test]
    fn set_workspace_clears_last_reported() {
        let state = AppState::new();
        state.set_last_reported(&[make_task("a", "Todo", Some(0.0))]);
        assert!(!state.get_last_reported().is_empty());

        state.set_workspace(PathBuf::from("/tmp/new"));
        assert!(state.get_last_reported().is_empty());
    }

    #[test]
    fn seed_last_reported_populates_when_empty() {
        let state = AppState::new();
        state.seed_last_reported_if_empty(&[make_task("a", "Todo", Some(0.0))]);
        assert_eq!(
            state.get_last_reported().get("a"),
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
        state.set_last_reported(&[make_task("a", "Todo", Some(0.0))]);
        state.seed_last_reported_if_empty(&[make_task("a", "Doing", Some(5.0))]);
        assert_eq!(
            state.get_last_reported().get("a"),
            Some(&("Todo".to_string(), Some(0.0)))
        );
    }

    #[test]
    fn get_last_reported_returns_clone() {
        // Mirrors the workspace() / get_cached_tasks() contract: the call
        // must not hold the lock past return. Verified by snapshotting,
        // mutating via the API, and confirming the snapshot is unaffected.
        let state = AppState::new();
        state.set_last_reported(&[make_task("a", "Todo", Some(0.0))]);
        let snapshot = state.get_last_reported();
        state.set_last_reported(&[make_task("a", "Doing", Some(-1.0))]);
        assert_eq!(snapshot.get("a"), Some(&("Todo".to_string(), Some(0.0))));
    }

    #[test]
    fn shared_across_threads_via_arc() {
        let state = Arc::new(AppState::new());

        let writers: Vec<_> = (0..8)
            .map(|i| {
                let state = Arc::clone(&state);
                thread::spawn(move || {
                    state.set_workspace(PathBuf::from(format!("/tmp/w{i}")));
                })
            })
            .collect();
        for w in writers {
            w.join().unwrap();
        }

        // After the contention, exactly one of the writes wins; the value must
        // be one of the ones we set and never None.
        let got = state.workspace().expect("some writer must have won");
        let s = got.to_string_lossy();
        assert!(s.starts_with("/tmp/w") && s.len() == 7, "unexpected value: {got:?}");
    }
}
