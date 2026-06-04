use crate::error::{CmdResult, CommandError};
use std::path::{Path, PathBuf};

/// Canonicalize a workspace directory. Use when the canonical form is needed
/// independently (e.g. for joining new paths) or when verifying many paths
/// against the same workspace via [`check_in_workspace`].
pub fn canonical_workspace(workspace: &Path) -> CmdResult<PathBuf> {
    Ok(std::fs::canonicalize(workspace)?)
}

/// Canonicalize `path` and verify it lives inside `workspace`. Performs one
/// canonicalize on the workspace internally; for hot loops, prefer
/// pre-canonicalizing once with [`canonical_workspace`] and reusing the result
/// via [`check_in_workspace`].
pub fn ensure_in_workspace(workspace: &Path, path: &Path) -> CmdResult<PathBuf> {
    let workspace_canonical = canonical_workspace(workspace)?;
    check_in_workspace(&workspace_canonical, path)
}

/// Canonicalize `path` and verify it lives inside an already-canonical
/// `workspace`. Returns the canonical `path`.
pub fn check_in_workspace(workspace_canonical: &Path, path: &Path) -> CmdResult<PathBuf> {
    let path_canonical = std::fs::canonicalize(path)?;
    if !path_canonical.starts_with(workspace_canonical) {
        return Err(CommandError::AccessDenied);
    }
    Ok(path_canonical)
}
