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
