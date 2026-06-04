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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn touch(dir: &Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        fs::write(&p, b"").unwrap();
        p
    }

    #[test]
    fn canonical_workspace_returns_canonical_form() {
        let ws = TempDir::new().unwrap();
        let result = canonical_workspace(ws.path()).unwrap();
        // The canonical form must exist and refer to the same directory.
        assert_eq!(result, fs::canonicalize(ws.path()).unwrap());
    }

    #[test]
    fn canonical_workspace_errors_on_missing_path() {
        let ws = TempDir::new().unwrap();
        let missing = ws.path().join("does-not-exist");
        let err = canonical_workspace(&missing).unwrap_err();
        assert!(matches!(err, CommandError::Io(_)));
    }

    #[test]
    fn ensure_in_workspace_accepts_legit_child() {
        let ws = TempDir::new().unwrap();
        let file = touch(ws.path(), "task.md");

        let canonical = ensure_in_workspace(ws.path(), &file).unwrap();
        assert_eq!(canonical, fs::canonicalize(&file).unwrap());
    }

    #[test]
    fn ensure_in_workspace_accepts_nested_child() {
        let ws = TempDir::new().unwrap();
        let sub = ws.path().join("nested");
        fs::create_dir(&sub).unwrap();
        let file = touch(&sub, "deep.md");

        let canonical = ensure_in_workspace(ws.path(), &file).unwrap();
        assert!(canonical.starts_with(fs::canonicalize(ws.path()).unwrap()));
    }

    #[test]
    fn ensure_in_workspace_errors_on_missing_path() {
        let ws = TempDir::new().unwrap();
        let missing = ws.path().join("nope.md");
        let err = ensure_in_workspace(ws.path(), &missing).unwrap_err();
        assert!(matches!(err, CommandError::Io(_)));
    }

    #[test]
    fn ensure_in_workspace_rejects_sibling_path() {
        let ws = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let outside_file = touch(other.path(), "outside.md");

        let err = ensure_in_workspace(ws.path(), &outside_file).unwrap_err();
        assert!(matches!(err, CommandError::AccessDenied));
    }

    #[test]
    fn ensure_in_workspace_rejects_dotdot_escape() {
        // Create a tempdir and a sibling file in its parent. The "evil" path
        // traverses out of the workspace via "..".
        let ws = TempDir::new().unwrap();
        let parent = ws.path().parent().expect("tempdir has a parent");
        let escape_file = tempfile::NamedTempFile::new_in(parent).unwrap();
        let file_name = escape_file.path().file_name().unwrap();

        let evil = ws.path().join("..").join(file_name);
        let err = ensure_in_workspace(ws.path(), &evil).unwrap_err();
        assert!(matches!(err, CommandError::AccessDenied));
    }

    #[cfg(unix)]
    #[test]
    fn ensure_in_workspace_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let ws = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_file = touch(outside.path(), "secret.md");

        let link = ws.path().join("link.md");
        symlink(&outside_file, &link).unwrap();

        let err = ensure_in_workspace(ws.path(), &link).unwrap_err();
        assert!(matches!(err, CommandError::AccessDenied));
    }

    #[test]
    fn check_in_workspace_reuses_canonical_workspace() {
        let ws = TempDir::new().unwrap();
        let canonical = canonical_workspace(ws.path()).unwrap();
        let file = touch(ws.path(), "a.md");

        let got = check_in_workspace(&canonical, &file).unwrap();
        assert!(got.starts_with(&canonical));
    }

    #[test]
    fn check_in_workspace_rejects_outside() {
        let ws = TempDir::new().unwrap();
        let canonical = canonical_workspace(ws.path()).unwrap();
        let other = TempDir::new().unwrap();
        let outside = touch(other.path(), "x.md");

        let err = check_in_workspace(&canonical, &outside).unwrap_err();
        assert!(matches!(err, CommandError::AccessDenied));
    }
}
