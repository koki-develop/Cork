use crate::error::{CmdResult, CommandError};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const CORK_CONFIG_FILE: &str = ".cork.json";

/// Serializes every `.cork.json` read-modify-write cycle across all
/// workspaces and windows in this process. Two windows on the same
/// workspace (e.g. one renaming it while another reorders statuses) can
/// call `write_cork_config_key` at nearly the same time; without this lock
/// each would read the same starting file, mutate only its own key in
/// memory, and whichever wrote last would silently discard the other's
/// change. This only covers same-process races — Cork's single-instance
/// plugin means every window for a given launch lives in one process, so
/// that's the only case that can actually occur.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn cork_config_path(dir: &Path) -> PathBuf {
    dir.join(CORK_CONFIG_FILE)
}

/// Reads and parses `.cork.json`'s top-level object. Returns `None` if the
/// file doesn't exist or fails to parse — callers decide what "no config
/// yet" means for their own key (e.g. built-in defaults vs an empty value),
/// so this stays agnostic to any particular key.
pub(crate) fn read_cork_config(dir: &Path) -> Option<Value> {
    let path = cork_config_path(dir);
    let content = fs::read_to_string(&path).ok()?;
    match serde_json::from_str(&content) {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("failed to parse {}: {e}", path.display());
            None
        }
    }
}

/// Merges `value` into `.cork.json` under `key`, preserving every other
/// top-level key already on disk (each domain — statuses, workspace name,
/// ... — only ever touches its own key). Creates the file if it doesn't
/// exist yet.
///
/// Refuses to write (rather than silently starting over from `{}`) if the
/// existing file can't be read for a reason other than "it doesn't exist
/// yet", or if it exists but isn't valid JSON / isn't an object at its
/// root — either would otherwise permanently discard every sibling key.
pub(crate) fn write_cork_config_key(dir: &Path, key: &str, value: Value) -> CmdResult<()> {
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let path = cork_config_path(dir);
    let mut root = match fs::read_to_string(&path) {
        Ok(content) => {
            let parsed: Value = serde_json::from_str(&content).map_err(|e| {
                CommandError::other(format!("failed to parse {}: {e}", path.display()))
            })?;
            if !parsed.is_object() {
                return Err(CommandError::other(format!(
                    "{} does not contain a JSON object at its root",
                    path.display()
                )));
            }
            parsed
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => serde_json::json!({}),
        Err(e) => return Err(e.into()),
    };

    if let Some(obj) = root.as_object_mut() {
        obj.insert(key.to_string(), value);
    }
    let mut serialized = serde_json::to_string_pretty(&root).map_err(CommandError::other)?;
    serialized.push('\n');
    fs::write(&path, serialized)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn read_cork_config_missing_file_returns_none() {
        let dir = tempdir().unwrap();
        assert!(read_cork_config(dir.path()).is_none());
    }

    #[test]
    fn read_cork_config_malformed_json_returns_none() {
        let dir = tempdir().unwrap();
        fs::write(cork_config_path(dir.path()), "not json").unwrap();
        assert!(read_cork_config(dir.path()).is_none());
    }

    #[test]
    fn read_cork_config_parses_existing_file() {
        let dir = tempdir().unwrap();
        fs::write(cork_config_path(dir.path()), r#"{"foo":"bar"}"#).unwrap();
        let value = read_cork_config(dir.path()).unwrap();
        assert_eq!(value.get("foo").and_then(Value::as_str), Some("bar"));
    }

    #[test]
    fn write_cork_config_key_creates_file_when_missing() {
        let dir = tempdir().unwrap();
        write_cork_config_key(dir.path(), "name", serde_json::json!("My Workspace")).unwrap();
        let value = read_cork_config(dir.path()).unwrap();
        assert_eq!(
            value.get("name").and_then(Value::as_str),
            Some("My Workspace")
        );
    }

    #[test]
    fn write_cork_config_key_preserves_other_keys() {
        let dir = tempdir().unwrap();
        fs::write(
            cork_config_path(dir.path()),
            r#"{"statuses":[{"label":"Todo"}]}"#,
        )
        .unwrap();
        write_cork_config_key(dir.path(), "name", serde_json::json!("My Workspace")).unwrap();
        let value = read_cork_config(dir.path()).unwrap();
        assert_eq!(
            value.get("name").and_then(Value::as_str),
            Some("My Workspace")
        );
        assert!(value.get("statuses").is_some());
    }

    #[test]
    fn write_cork_config_key_overwrites_same_key() {
        let dir = tempdir().unwrap();
        write_cork_config_key(dir.path(), "name", serde_json::json!("Old Name")).unwrap();
        write_cork_config_key(dir.path(), "name", serde_json::json!("New Name")).unwrap();
        let value = read_cork_config(dir.path()).unwrap();
        assert_eq!(value.get("name").and_then(Value::as_str), Some("New Name"));
    }

    #[test]
    fn write_cork_config_key_refuses_malformed_json_without_touching_disk() {
        let dir = tempdir().unwrap();
        let path = cork_config_path(dir.path());
        fs::write(&path, "not json").unwrap();

        let result = write_cork_config_key(dir.path(), "name", serde_json::json!("New Name"));

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "not json");
    }

    #[test]
    fn write_cork_config_key_refuses_non_object_root_without_touching_disk() {
        let dir = tempdir().unwrap();
        let path = cork_config_path(dir.path());
        fs::write(&path, "[1,2,3]").unwrap();

        let result = write_cork_config_key(dir.path(), "name", serde_json::json!("New Name"));

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "[1,2,3]");
    }

    #[test]
    fn write_cork_config_key_serializes_concurrent_writers_without_data_loss() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_path_buf();

        let handles: Vec<_> = (0..8)
            .map(|i| {
                let dir_path = dir_path.clone();
                std::thread::spawn(move || {
                    write_cork_config_key(&dir_path, &format!("key{i}"), serde_json::json!(i))
                        .unwrap();
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }

        let root = read_cork_config(&dir_path).unwrap();
        for i in 0..8 {
            assert_eq!(root.get(format!("key{i}")).and_then(Value::as_i64), Some(i));
        }
    }
}
