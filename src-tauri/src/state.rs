use crate::error::{CmdResult, CommandError};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    workspace_dir: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspace_dir: Mutex::new(None),
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
