use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};

use clap::Parser;

/// Cork — Kanban board for local Markdown files.
///
/// Running `cork` with no arguments opens a new empty Cork window (the same as
/// the `File > New Window` menu). Passing a directory opens it as a workspace,
/// focusing the existing window if that workspace is already open.
#[derive(Parser)]
#[command(name = "cork", version = env!("CORK_VERSION"), about, long_about = None)]
struct Cli {
    /// Directory to open as a workspace. Omit to open a new empty window.
    path: Option<PathBuf>,
}

/// The Cork app executable that ships next to this CLI inside the bundle
/// (`Cork.app/Contents/MacOS/{cork,cork-cli}`). Launching it is how the CLI
/// reaches the app: a cold launch boots Cork normally, and a launch while Cork
/// is already running is intercepted by `tauri-plugin-single-instance`, which
/// forwards our argv to the live instance and exits the spawned process.
const APP_BINARY_NAME: &str = "cork";

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli.path) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("cork: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(path: Option<PathBuf>) -> Result<(), String> {
    // Resolve the workspace argument to an absolute, symlink-free directory
    // *before* handing it to the app. The running Cork instance receives our
    // argv over a Unix socket with no shared working directory, so a relative
    // path would be meaningless on the other side. Validating here also lets us
    // fail fast with a terminal-friendly message instead of silently launching
    // the app to do nothing.
    let workspace = path.map(|p| resolve_workspace(&p)).transpose()?;

    let app = locate_app_binary()?;

    let mut command = Command::new(&app);
    if let Some(workspace) = &workspace {
        command.arg(workspace);
    }
    // Detach from the terminal: the CLI must return immediately rather than
    // block for the app's lifetime, and we don't want the GUI app's output on
    // the user's terminal. On a cold start the spawned process *is* the app and
    // keeps running after the CLI exits (reparented to launchd); on a warm
    // start single-instance forwards our argv and the spawned process exits on
    // its own almost immediately.
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command
        .spawn()
        .map_err(|e| format!("failed to launch Cork at {}: {e}", app.display()))?;

    Ok(())
}

/// Turn a user-supplied path into the absolute, canonical directory the app
/// should open, or a human-readable error if it can't be used as a workspace.
/// `canonicalize` resolves the path against the current working directory and
/// follows symlinks, and fails outright if the path doesn't exist.
fn resolve_workspace(path: &Path) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|e| format!("cannot open '{}': {e}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("'{}' is not a directory", path.display()));
    }
    Ok(canonical)
}

/// Resolve the path of the Cork app binary that sits next to the CLI. We
/// canonicalize our own executable path first: Homebrew exposes the CLI as a
/// `cork` symlink on `PATH`, so without resolving it we'd look for the app
/// binary in `/opt/homebrew/bin` (and `cork` there is the symlink to ourselves)
/// instead of inside the bundle's `Contents/MacOS`.
fn locate_app_binary() -> Result<PathBuf, String> {
    let exe =
        std::env::current_exe().map_err(|e| format!("cannot determine the CLI's own path: {e}"))?;
    let exe = std::fs::canonicalize(&exe)
        .map_err(|e| format!("cannot resolve the CLI's own path ({}): {e}", exe.display()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "the CLI binary has no parent directory".to_string())?;
    resolve_app_binary(dir)
}

/// Join `APP_BINARY_NAME` onto the CLI's directory and confirm it's a real
/// file. Split out from `locate_app_binary` so the lookup can be unit-tested
/// without depending on the test binary's own location.
fn resolve_app_binary(cli_dir: &Path) -> Result<PathBuf, String> {
    let app = cli_dir.join(APP_BINARY_NAME);
    if !app.is_file() {
        return Err(format!(
            "could not find the Cork app binary next to the CLI (expected at {})",
            app.display()
        ));
    }
    Ok(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn resolve_workspace_accepts_an_existing_directory() {
        let tmp = TempDir::new().unwrap();
        let resolved = resolve_workspace(tmp.path()).unwrap();
        // The result is canonical, so it round-trips through canonicalize.
        assert_eq!(resolved, std::fs::canonicalize(tmp.path()).unwrap());
        assert!(resolved.is_absolute());
    }

    #[test]
    fn resolve_workspace_rejects_a_missing_path() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("does-not-exist");
        let err = resolve_workspace(&missing).unwrap_err();
        assert!(err.contains("cannot open"), "unexpected error: {err}");
    }

    #[test]
    fn resolve_workspace_rejects_a_regular_file() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("note.md");
        std::fs::write(&file, "").unwrap();
        let err = resolve_workspace(&file).unwrap_err();
        assert!(err.contains("is not a directory"), "unexpected error: {err}");
    }

    #[test]
    fn resolve_app_binary_finds_a_sibling_file() {
        let tmp = TempDir::new().unwrap();
        let app = tmp.path().join(APP_BINARY_NAME);
        std::fs::write(&app, "").unwrap();
        assert_eq!(resolve_app_binary(tmp.path()).unwrap(), app);
    }

    #[test]
    fn resolve_app_binary_errors_when_sibling_is_missing() {
        let tmp = TempDir::new().unwrap();
        let err = resolve_app_binary(tmp.path()).unwrap_err();
        assert!(
            err.contains("could not find the Cork app binary"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn resolve_app_binary_errors_when_sibling_is_a_directory() {
        // A directory named `cork` next to the CLI is not a launchable binary.
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir(tmp.path().join(APP_BINARY_NAME)).unwrap();
        assert!(resolve_app_binary(tmp.path()).is_err());
    }
}
