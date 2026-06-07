use crate::error::{CmdResult, CommandError};
use crate::frontmatter;
use crate::security;
use crate::state::AppState;
use nucleo_matcher::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use rayon::prelude::*;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub body: String,
    #[serde(default)]
    pub order: Option<f64>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Tag filter — discriminated by the `operator` field. Tag-based variants
/// carry a `tags` array; empty/non-empty checks have no operand. The
/// `#[serde(tag = "operator", rename_all = "snake_case")]` attribute makes
/// the wire format `{"operator":"contains","tags":[...]}` /
/// `{"operator":"is_empty"}`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "operator", rename_all = "snake_case")]
pub enum TagFilter {
    Contains { tags: Vec<String> },
    NotContains { tags: Vec<String> },
    ContainsAny { tags: Vec<String> },
    ContainsAll { tags: Vec<String> },
    IsEmpty,
    IsNotEmpty,
}

fn tags_contains_any(task_tags: &[String], targets: &[String]) -> bool {
    targets.iter().any(|t| task_tags.iter().any(|x| x == t))
}

/// Match a single filter. Empty operand on tag-based variants is treated as
/// a no-op (returns true), matching the frontend's "still being typed"
/// convention — the UI prunes such filters before persisting them, but the
/// backend tolerates them defensively.
fn matches_filter(task: &Task, filter: &TagFilter) -> bool {
    match filter {
        TagFilter::Contains { tags } | TagFilter::ContainsAny { tags } => {
            tags.is_empty() || tags_contains_any(&task.tags, tags)
        }
        TagFilter::NotContains { tags } => {
            tags.is_empty() || !tags_contains_any(&task.tags, tags)
        }
        TagFilter::ContainsAll { tags } => {
            tags.is_empty() || tags.iter().all(|t| task.tags.iter().any(|x| x == t))
        }
        TagFilter::IsEmpty => task.tags.is_empty(),
        TagFilter::IsNotEmpty => !task.tags.is_empty(),
    }
}

fn matches_all_filters(task: &Task, filters: &[TagFilter]) -> bool {
    filters.iter().all(|f| matches_filter(task, f))
}

#[derive(Deserialize)]
struct TaskFrontmatter {
    status: Option<String>,
    #[serde(default)]
    order: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_tags_lenient")]
    tags: Vec<String>,
}

/// Falling back to an empty Vec for non-array shapes or arrays with any
/// non-string element keeps a malformed `tags:` from poisoning the whole
/// task — the file still loads with no tags. (Missing keys are handled by
/// `#[serde(default)]` and never reach this function.) Note that a mixed
/// array like `["a", 42]` returns `[]` entirely, not a partial filter.
fn deserialize_tags_lenient<'de, D>(de: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(de)?;
    let Some(arr) = value.as_array() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(arr.len());
    for v in arr {
        match v.as_str() {
            Some(s) => out.push(s.to_string()),
            None => return Ok(Vec::new()),
        }
    }
    Ok(out)
}

/// Apply title-fuzzy query + tag filters to a task list. Empty `query` /
/// empty `filters` skip their respective passes. Sort order is preserved
/// from the input (caller must pre-sort).
fn apply_query_and_filters(
    tasks: Vec<Task>,
    query: Option<&str>,
    filters: &[TagFilter],
) -> Vec<Task> {
    let after_query: Vec<Task> = match query {
        Some(q) if !q.is_empty() => {
            let mut matcher = Matcher::new(Config::DEFAULT);
            let pattern = Pattern::new(
                q,
                CaseMatching::Ignore,
                Normalization::Smart,
                AtomKind::Fuzzy,
            );
            tasks
                .into_iter()
                .filter(|task| {
                    let mut buf = Vec::new();
                    pattern
                        .score(Utf32Str::new(&task.title, &mut buf), &mut matcher)
                        .is_some()
                })
                .collect()
        }
        _ => tasks,
    };

    if filters.is_empty() {
        after_query
    } else {
        after_query
            .into_iter()
            .filter(|task| matches_all_filters(task, filters))
            .collect()
    }
}

/// Collect unique tags from a task slice, sorted case-insensitively while
/// preserving each tag's original case. Dedup is case-sensitive — `Bug`
/// and `bug` are kept as separate entries.
fn collect_unique_tags_sorted(tasks: &[Task]) -> Vec<String> {
    let mut set: HashSet<String> = HashSet::new();
    for task in tasks {
        for tag in &task.tags {
            set.insert(tag.clone());
        }
    }
    let mut tags: Vec<String> = set.into_iter().collect();
    tags.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| a.cmp(b)));
    tags
}

#[tauri::command]
pub fn list_tasks(
    query: Option<String>,
    filters: Option<Vec<TagFilter>>,
    state: tauri::State<'_, AppState>,
) -> Vec<Task> {
    let Some(dir) = state.workspace() else {
        return Vec::new();
    };

    let has_query = query.as_ref().is_some_and(|q| !q.is_empty());
    let filters_slice: &[TagFilter] = filters.as_deref().unwrap_or(&[]);
    let has_filters = !filters_slice.is_empty();

    let cached = if has_query || has_filters {
        state.get_cached_tasks().unwrap_or_else(|| {
            let all = read_all_tasks(&dir);
            state.set_cached_tasks(all);
            state.get_cached_tasks().unwrap()
        })
    } else {
        let all = read_all_tasks(&dir);
        state.set_cached_tasks(all.clone());
        all
    };

    apply_query_and_filters(cached, query.as_deref(), filters_slice)
}

#[tauri::command]
pub fn list_all_tags(state: tauri::State<'_, AppState>) -> Vec<String> {
    let Some(dir) = state.workspace() else {
        return Vec::new();
    };

    let cached = state.get_cached_tasks().unwrap_or_else(|| {
        let all = read_all_tasks(&dir);
        state.set_cached_tasks(all);
        state.get_cached_tasks().unwrap()
    });

    collect_unique_tags_sorted(&cached)
}

fn read_all_tasks(dir: &Path) -> Vec<Task> {
    let md_files: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("md"))
                .collect()
        })
        .unwrap_or_default();

    let mut tasks: Vec<Task> = md_files
        .par_iter()
        .filter_map(|file_path| {
            let content = read_task_preview(file_path)?;
            let title = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&content);
            let f = fm?;
            let status = f.status.filter(|s| !s.is_empty())?;
            Some(Task {
                id: file_path.to_string_lossy().to_string(),
                title,
                status,
                body,
                order: f.order,
                tags: f.tags,
            })
        })
        .collect();

    tasks.sort_by(|a, b| {
        let a_order = a.order.unwrap_or(f64::MAX);
        let b_order = b.order.unwrap_or(f64::MAX);
        a_order
            .partial_cmp(&b_order)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.title.cmp(&b.title))
    });
    tasks
}

#[tauri::command]
pub fn get_task(path: String, state: tauri::State<'_, AppState>) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;

    let content = fs::read_to_string(&path)?;
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&content);
    let f = fm.ok_or(CommandError::MissingFrontmatter)?;
    let status = f.status.unwrap_or_default();
    Ok(Task {
        id: path.to_string_lossy().to_string(),
        title,
        status,
        body,
        order: f.order,
        tags: f.tags,
    })
}

#[tauri::command]
pub fn create_task(
    title: String,
    status: String,
    body: Option<String>,
    order: Option<f64>,
    tags: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;

    let title = sanitize_title(&title)?;

    let file_path = dir_canonical.join(format!("{}.md", title));
    if file_path.exists() {
        return Err(CommandError::DuplicateTask);
    }

    let body = body.unwrap_or_default();
    let mut fm_value = serde_json::json!({ "status": status });
    if let Some(obj) = fm_value.as_object_mut() {
        if let Some(o) = order {
            obj.insert("order".to_string(), serde_json::json!(o));
        }
        if let Some(t) = tags.as_ref().filter(|t| !t.is_empty()) {
            obj.insert("tags".to_string(), serde_json::json!(t));
        }
    }
    let yaml = frontmatter::serialize(&fm_value);
    let content = frontmatter::ensure_trailing_newline(format!("---\n{}---\n\n{}", yaml, body));
    fs::write(&file_path, content)?;
    state.invalidate_cache();

    Ok(Task {
        id: file_path.to_string_lossy().to_string(),
        title,
        status,
        body,
        order,
        tags: tags.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn update_task(
    path: String,
    title: Option<String>,
    status: Option<String>,
    body: Option<String>,
    order: Option<f64>,
    tags: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;
    let path_canonical = security::check_in_workspace(&dir_canonical, Path::new(&path))?;

    let content = fs::read_to_string(&path_canonical)?;
    let (fm, current_body): (Option<TaskFrontmatter>, String) = frontmatter::parse(&content);

    let body_provided = body.is_some();
    let new_body = body.unwrap_or(current_body);

    let current_status = fm.as_ref().and_then(|f| f.status.as_deref()).unwrap_or("");
    let new_status = status.unwrap_or_else(|| current_status.to_string());
    let current_order = order.or_else(|| fm.as_ref().and_then(|f| f.order));
    let current_tags = fm
        .as_ref()
        .map(|f| f.tags.clone())
        .unwrap_or_default();
    let current_title = path_canonical
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let (new_title, title_changed) = match title {
        Some(t) => {
            let sanitized = sanitize_title(&t)?;
            let changed = sanitized != current_title;
            (sanitized, changed)
        }
        None => (current_title, false),
    };

    // Lift the three semantic states of `tags` into an enum so the
    // (Keep / Set / Clear) intent is visible at one site instead of
    // scattered across `filter(non_empty)` + `matches!(empty)` checks.
    enum TagOp {
        Keep,
        Set(Vec<String>),
        Clear,
    }
    let tag_op = match tags {
        None => TagOp::Keep,
        Some(t) if t.is_empty() => TagOp::Clear,
        Some(t) => TagOp::Set(t),
    };
    let new_tags = match &tag_op {
        TagOp::Keep => current_tags.clone(),
        TagOp::Set(t) => t.clone(),
        TagOp::Clear => Vec::new(),
    };

    let mut fm_updates: Vec<(&str, serde_json::Value)> =
        vec![("status", serde_json::json!(new_status))];
    if let Some(o) = current_order {
        fm_updates.push(("order", serde_json::json!(o)));
    }
    if let TagOp::Set(t) = &tag_op {
        fm_updates.push(("tags", serde_json::json!(t)));
    }
    let new_content = if body_provided {
        let with_updates = frontmatter::update(&content, &fm_updates);
        let marker = "\n---\n";
        let rebuilt = match with_updates.find(marker) {
            Some(pos) => format!("{}{}", &with_updates[..pos + marker.len()], new_body),
            None => format!("---\n---\n{}", new_body),
        };
        frontmatter::ensure_trailing_newline(rebuilt)
    } else {
        frontmatter::update(&content, &fm_updates)
    };
    let new_content = match tag_op {
        TagOp::Clear if !current_tags.is_empty() => {
            frontmatter::remove_keys(&new_content, &["tags"]).map_err(CommandError::other)?
        }
        _ => new_content,
    };

    let target_path = if title_changed {
        let new_path = dir_canonical.join(format!("{}.md", new_title));
        rename_and_write_task(&path_canonical, &new_path, &new_content)?;
        new_path
    } else {
        fs::write(&path_canonical, &new_content)?;
        path_canonical
    };

    state.invalidate_cache();

    Ok(Task {
        id: target_path.to_string_lossy().to_string(),
        title: new_title,
        status: new_status,
        body: new_body,
        order: current_order,
        tags: new_tags,
    })
}

#[tauri::command]
pub fn move_task(
    path: String,
    status: String,
    order: f64,
    state: tauri::State<'_, AppState>,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;
    let content = fs::read_to_string(&path)?;
    let updated = frontmatter::update(
        &content,
        &[
            ("status", serde_json::json!(status)),
            ("order", serde_json::json!(order)),
        ],
    );
    fs::write(&path, updated)?;
    state.invalidate_cache();
    Ok(())
}

#[tauri::command]
pub fn delete_task(path: String, state: tauri::State<'_, AppState>) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;
    fs::remove_file(&path)?;
    state.invalidate_cache();
    Ok(())
}

#[tauri::command]
pub fn renumber_tasks(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;
    for (i, path) in paths.iter().enumerate() {
        let path_canonical = security::check_in_workspace(&dir_canonical, Path::new(path))?;
        let content = fs::read_to_string(&path_canonical)?;
        let updated = frontmatter::update(&content, &[("order", serde_json::json!(i as f64))]);
        fs::write(&path_canonical, updated)?;
    }
    state.invalidate_cache();
    Ok(())
}

static RENAME_TMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Writes `content` to `dst`, renaming from `src` to `dst` when they differ.
///
/// On a case-insensitive filesystem (default macOS APFS, NTFS), a case-only
/// title change makes `dst.exists()` report true while `dst` and `src`
/// actually point to the same file. Treating that as a duplicate would
/// reject legitimate `aaa` → `aaA` renames; conversely, the original
/// `write(dst) + remove(src)` sequence would write the new content and
/// then immediately delete it. We distinguish the cases with
/// `canonicalize()` and, for case-only renames, go through a temp name so
/// the directory entry's case is updated even on filesystems where
/// `rename(2)` is a no-op when source and destination differ only in case
/// (notably older HFS+).
fn rename_and_write_task(src: &Path, dst: &Path, content: &str) -> CmdResult<()> {
    if src == dst {
        fs::write(src, content)?;
        return Ok(());
    }

    let same_file =
        dst.exists() && dst.canonicalize().ok().as_deref() == Some(src);

    if dst.exists() && !same_file {
        return Err(CommandError::DuplicateTask);
    }

    if same_file {
        let parent = dst
            .parent()
            .ok_or_else(|| CommandError::other("destination has no parent"))?;
        let tmp = parent.join(format!(
            ".cork-rename-{}-{}.tmp",
            std::process::id(),
            RENAME_TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::rename(src, &tmp)?;
        fs::rename(&tmp, dst)?;
        fs::write(dst, content)?;
    } else {
        fs::write(dst, content)?;
        fs::remove_file(src)?;
    }
    Ok(())
}

fn sanitize_title(title: &str) -> CmdResult<String> {
    let sanitized: String = title
        .chars()
        .map(|c| if c == '/' { '-' } else { c })
        .filter(|&c| c != '\0')
        .collect();
    let trimmed = sanitized.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::EmptyTitle);
    }
    Ok(trimmed)
}

/// Reads only frontmatter + up to 2 non-empty body lines from a file.
/// Returns None if the file does not start with "---" (no frontmatter).
fn read_task_preview(file_path: &Path) -> Option<String> {
    let file = fs::File::open(file_path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut lines = reader.lines();

    let first = lines.next()?.ok()?;
    if first.trim_end() != "---" {
        return None;
    }

    let mut fm_lines: Vec<String> = Vec::new();
    loop {
        let line = lines.next()?.ok()?;
        if line.trim_end() == "---" {
            break;
        }
        fm_lines.push(line);
    }

    let mut body_lines: Vec<String> = Vec::new();
    let mut non_empty = 0u32;
    for line in lines {
        let Ok(line) = line else { break };
        if !line.trim().is_empty() {
            non_empty += 1;
        }
        body_lines.push(line);
        if non_empty >= 2 {
            break;
        }
    }

    Some(format!(
        "---\n{}\n---\n{}",
        fm_lines.join("\n"),
        body_lines.join("\n")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // --- sanitize_title ------------------------------------------------------

    #[test]
    fn sanitize_title_replaces_path_separators() {
        assert_eq!(sanitize_title("foo/bar").unwrap(), "foo-bar");
        assert_eq!(sanitize_title("a/b/c").unwrap(), "a-b-c");
    }

    #[test]
    fn sanitize_title_filters_null_bytes() {
        assert_eq!(sanitize_title("hello\0world").unwrap(), "helloworld");
    }

    #[test]
    fn sanitize_title_trims_surrounding_whitespace() {
        assert_eq!(sanitize_title("  hi  ").unwrap(), "hi");
        assert_eq!(sanitize_title("\t\nhi\n\t").unwrap(), "hi");
    }

    #[test]
    fn sanitize_title_preserves_unicode() {
        assert_eq!(sanitize_title("日本語タイトル").unwrap(), "日本語タイトル");
        assert_eq!(sanitize_title("emoji-🎉").unwrap(), "emoji-🎉");
    }

    #[test]
    fn sanitize_title_rejects_empty_string() {
        assert!(matches!(
            sanitize_title("").unwrap_err(),
            CommandError::EmptyTitle
        ));
    }

    #[test]
    fn sanitize_title_rejects_whitespace_only() {
        assert!(matches!(
            sanitize_title("   ").unwrap_err(),
            CommandError::EmptyTitle
        ));
    }

    #[test]
    fn sanitize_title_rejects_only_null_bytes() {
        assert!(matches!(
            sanitize_title("\0\0\0").unwrap_err(),
            CommandError::EmptyTitle
        ));
    }

    #[test]
    fn sanitize_title_composes_replacements_with_trim() {
        // Slash replacement happens before trim.
        assert_eq!(sanitize_title(" foo/bar ").unwrap(), "foo-bar");
    }

    // --- rename_and_write_task -----------------------------------------------

    /// Detect at runtime whether the test's tempdir lives on a
    /// case-insensitive filesystem. Used to skip case-only assertions on
    /// case-sensitive filesystems (Linux ext4 in CI, APFS case-sensitive)
    /// where the production path simply doesn't apply.
    fn fs_is_case_insensitive(dir: &Path) -> bool {
        let lower = dir.join("__cork_case_probe.tmp");
        if fs::write(&lower, b"").is_err() {
            return false;
        }
        let upper = dir.join("__CORK_CASE_PROBE.tmp");
        let result = upper.exists();
        fs::remove_file(&lower).ok();
        result
    }

    #[test]
    fn rename_writes_in_place_when_src_equals_dst() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, "old").unwrap();

        rename_and_write_task(&path, &path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    }

    #[test]
    fn rename_to_new_path_moves_file_and_updates_content() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("old.md");
        let dst = dir.path().join("new.md");
        fs::write(&src, "old").unwrap();

        rename_and_write_task(&src, &dst, "new").unwrap();

        assert!(!src.exists());
        assert_eq!(fs::read_to_string(&dst).unwrap(), "new");
    }

    #[test]
    fn rename_to_existing_distinct_file_returns_duplicate() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("a.md");
        let dst = dir.path().join("b.md");
        fs::write(&src, "a content").unwrap();
        fs::write(&dst, "b content").unwrap();

        let err = rename_and_write_task(&src, &dst, "new").unwrap_err();
        assert!(matches!(err, CommandError::DuplicateTask));

        // Neither file should have been touched.
        assert_eq!(fs::read_to_string(&src).unwrap(), "a content");
        assert_eq!(fs::read_to_string(&dst).unwrap(), "b content");
    }

    #[test]
    fn rename_case_only_updates_filename_case_on_case_insensitive_fs() {
        let dir = TempDir::new().unwrap();
        if !fs_is_case_insensitive(dir.path()) {
            // On case-sensitive filesystems (CI Linux), `aaA.md` doesn't
            // exist when `aaa.md` does, so the case-only branch is
            // unreachable. The "distinct files" test already covers the
            // case-sensitive path.
            return;
        }

        // Use canonical paths to match the production code path. macOS
        // tempfile crates may return paths under `/var/folders/...` which
        // canonicalize to `/private/var/folders/...`; without
        // canonicalizing src, the `dst.canonicalize() == src` equality
        // check would compare a canonical path to a non-canonical one and
        // miss.
        let dir_canonical = fs::canonicalize(dir.path()).unwrap();
        let src = dir_canonical.join("aaa.md");
        fs::write(&src, "old content").unwrap();
        let dst = dir_canonical.join("aaA.md");

        rename_and_write_task(&src, &dst, "new content").unwrap();

        // Content was updated.
        assert_eq!(fs::read_to_string(&dst).unwrap(), "new content");

        // On-disk directory entry now uses the new case. Without the
        // two-step rename, older HFS+ leaves the on-disk name as `aaa.md`
        // even though both paths resolve to the same inode.
        let md_entries: Vec<String> = fs::read_dir(&dir_canonical)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.ends_with(".md"))
            .collect();
        assert_eq!(md_entries, vec!["aaA.md".to_string()]);
    }

    #[test]
    fn rename_case_only_does_not_leak_temp_file() {
        let dir = TempDir::new().unwrap();
        if !fs_is_case_insensitive(dir.path()) {
            return;
        }

        let dir_canonical = fs::canonicalize(dir.path()).unwrap();
        let src = dir_canonical.join("foo.md");
        fs::write(&src, "x").unwrap();
        let dst = dir_canonical.join("Foo.md");

        rename_and_write_task(&src, &dst, "y").unwrap();

        let leftover: Vec<String> = fs::read_dir(&dir_canonical)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.starts_with(".cork-rename-"))
            .collect();
        assert!(leftover.is_empty(), "leftover temp files: {:?}", leftover);
    }

    // --- read_task_preview ---------------------------------------------------

    fn write(dir: &Path, name: &str, content: &str) -> PathBuf {
        let p = dir.join(name);
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn preview_returns_none_for_missing_file() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("nope.md");
        assert!(read_task_preview(&missing).is_none());
    }

    #[test]
    fn preview_returns_none_when_first_line_is_not_fence() {
        let dir = TempDir::new().unwrap();
        let f = write(dir.path(), "a.md", "# heading\nbody\n");
        assert!(read_task_preview(&f).is_none());
    }

    #[test]
    fn preview_returns_none_when_frontmatter_unterminated() {
        let dir = TempDir::new().unwrap();
        let f = write(dir.path(), "a.md", "---\nstatus: todo\n");
        // No closing `---` before EOF → None.
        assert!(read_task_preview(&f).is_none());
    }

    #[test]
    fn preview_extracts_frontmatter_and_short_body() {
        let dir = TempDir::new().unwrap();
        let f = write(
            dir.path(),
            "a.md",
            "---\nstatus: todo\norder: 1\n---\nfirst line\nsecond line\n",
        );
        let preview = read_task_preview(&f).unwrap();
        assert!(preview.starts_with("---\n"));
        assert!(preview.contains("status: todo"));
        assert!(preview.contains("first line"));
        assert!(preview.contains("second line"));
    }

    #[test]
    fn preview_stops_after_two_non_empty_body_lines() {
        let dir = TempDir::new().unwrap();
        let f = write(
            dir.path(),
            "a.md",
            "---\nstatus: todo\n---\nL1\nL2\nL3-should-not-appear\n",
        );
        let preview = read_task_preview(&f).unwrap();
        assert!(preview.contains("L1"));
        assert!(preview.contains("L2"));
        assert!(!preview.contains("L3-should-not-appear"));
    }

    #[test]
    fn preview_includes_blank_lines_between_non_empty_lines() {
        let dir = TempDir::new().unwrap();
        let f = write(
            dir.path(),
            "a.md",
            "---\nstatus: todo\n---\nfirst\n\nsecond\nthird-excluded\n",
        );
        let preview = read_task_preview(&f).unwrap();
        // Blank line is included as part of body, "third" is excluded.
        assert!(preview.contains("first"));
        assert!(preview.contains("second"));
        assert!(!preview.contains("third-excluded"));
    }

    #[test]
    fn preview_handles_empty_body() {
        let dir = TempDir::new().unwrap();
        let f = write(dir.path(), "a.md", "---\nstatus: todo\n---\n");
        let preview = read_task_preview(&f).unwrap();
        assert!(preview.contains("status: todo"));
        // Body section is present but empty (just trailing newline).
        let body_marker = "\n---\n";
        let body_idx = preview.find(body_marker).unwrap() + body_marker.len();
        assert_eq!(&preview[body_idx..], "");
    }

    #[test]
    fn preview_handles_frontmatter_only_file_no_trailing_body() {
        // Same as above but verify the preview parses back as valid frontmatter.
        let dir = TempDir::new().unwrap();
        let f = write(dir.path(), "a.md", "---\nstatus: blocked\n---\n");
        let preview = read_task_preview(&f).unwrap();
        let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&preview);
        assert_eq!(fm.unwrap().status.as_deref(), Some("blocked"));
        assert_eq!(body.trim(), "");
    }

    #[test]
    fn preview_is_round_trip_parseable() {
        let dir = TempDir::new().unwrap();
        let f = write(
            dir.path(),
            "a.md",
            "---\nstatus: doing\norder: 2.5\n---\nbody first\n",
        );
        let preview = read_task_preview(&f).unwrap();
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(&preview);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("doing"));
        assert_eq!(fm.order, Some(2.5));
    }

    // --- tags ---------------------------------------------------------------

    #[test]
    fn task_serializes_with_tags_key() {
        let task = Task {
            id: "/tmp/x.md".to_string(),
            title: "x".to_string(),
            status: "todo".to_string(),
            body: String::new(),
            order: None,
            tags: vec!["bug".to_string(), "ui".to_string()],
        };
        let json = serde_json::to_value(&task).unwrap();
        assert_eq!(json["tags"], serde_json::json!(["bug", "ui"]));
    }

    #[test]
    fn task_frontmatter_parses_string_array_tags() {
        let content = "---\nstatus: todo\ntags:\n  - bug\n  - frontend\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        assert_eq!(fm.unwrap().tags, vec!["bug", "frontend"]);
    }

    #[test]
    fn task_frontmatter_handles_null_tags_as_empty() {
        let content = "---\nstatus: todo\ntags: null\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        assert_eq!(fm.unwrap().tags, Vec::<String>::new());
    }

    #[test]
    fn task_frontmatter_handles_missing_tags_as_empty() {
        let content = "---\nstatus: todo\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        assert_eq!(fm.unwrap().tags, Vec::<String>::new());
    }

    #[test]
    fn task_frontmatter_handles_string_tags_as_empty() {
        // `tags: "bug"` (scalar string) should not crash — we fall back to empty.
        let content = "---\nstatus: todo\ntags: bug\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("todo"));
        assert_eq!(fm.tags, Vec::<String>::new());
    }

    #[test]
    fn task_frontmatter_handles_integer_tags_as_empty() {
        let content = "---\nstatus: todo\ntags: 42\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        assert_eq!(fm.unwrap().tags, Vec::<String>::new());
    }

    #[test]
    fn task_frontmatter_tags_order_preserved() {
        let content = "---\nstatus: todo\ntags:\n  - zeta\n  - alpha\n  - beta\n---\nbody\n";
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(content);
        assert_eq!(fm.unwrap().tags, vec!["zeta", "alpha", "beta"]);
    }

    #[test]
    fn tags_with_yaml_special_chars_round_trip() {
        // Tags can legitimately contain `:`, `[`, `#`, `-`, etc. — YAML's
        // emitter must quote them so they parse back as strings, not as
        // maps / sequences / comments. If frontmatter::serialize ever
        // emits these unquoted, this round-trip silently corrupts data.
        let inputs = vec![
            "bug: critical".to_string(),
            "[wip]".to_string(),
            "#urgent".to_string(),
            "a:b:c".to_string(),
            "- leading-dash".to_string(),
            "tag with spaces".to_string(),
        ];
        let yaml = frontmatter::serialize(&serde_json::json!({
            "status": "todo",
            "tags": inputs.clone(),
        }));
        let doc = format!("---\n{}---\nbody\n", yaml);
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(&doc);
        let fm = fm.expect("frontmatter must parse");
        assert_eq!(fm.status.as_deref(), Some("todo"));
        assert_eq!(fm.tags, inputs);
    }

    #[test]
    fn clear_tags_via_remove_keys_works_when_body_also_replaced() {
        // Reproduces the (body=Some, tags=Some(vec![])) branch of
        // update_task: frontmatter::update (without tags in fm_updates) →
        // body marker-rebuild → frontmatter::remove_keys(&_, &["tags"]).
        // Guards against future refactors that swap the order and let body
        // updates resurrect a cleared `tags:` key.
        let original = "---\nstatus: todo\ntags:\n  - bug\n  - ui\n---\nold body\n";

        let with_status_only = frontmatter::update(
            original,
            &[("status", serde_json::json!("doing"))],
        );
        let marker = "\n---\n";
        let pos = with_status_only.find(marker).unwrap();
        let rebuilt = format!(
            "{}{}",
            &with_status_only[..pos + marker.len()],
            "brand new body"
        );
        let rebuilt = frontmatter::ensure_trailing_newline(rebuilt);
        let final_content = frontmatter::remove_keys(&rebuilt, &["tags"]).unwrap();

        let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&final_content);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("doing"));
        assert_eq!(fm.tags, Vec::<String>::new());
        assert_eq!(body, "brand new body");
        assert!(!final_content.contains("tags"), "tags key must be gone");
    }

    #[test]
    fn round_trip_add_tags_other_update_remove_tags() {
        // Simulate the update_task flow: write tags, then update an unrelated
        // field, then clear tags — final document should match a fresh write
        // with no tags at all.
        let original = "---\nstatus: todo\norder: 1\n---\nbody\n";
        let with_tags = frontmatter::update(
            original,
            &[
                ("status", serde_json::json!("todo")),
                ("order", serde_json::json!(1.0)),
                ("tags", serde_json::json!(["bug", "ui"])),
            ],
        );
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(&with_tags);
        assert_eq!(fm.unwrap().tags, vec!["bug", "ui"]);

        let after_status_update = frontmatter::update(
            &with_tags,
            &[("status", serde_json::json!("doing"))],
        );
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(&after_status_update);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("doing"));
        assert_eq!(fm.tags, vec!["bug", "ui"]);

        let cleared = frontmatter::remove_keys(&after_status_update, &["tags"]).unwrap();
        let (fm, _) = frontmatter::parse::<TaskFrontmatter>(&cleared);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("doing"));
        assert_eq!(fm.tags, Vec::<String>::new());
    }

    // --- fuzzy search -------------------------------------------------------

    fn score(pattern: &Pattern, text: &str, matcher: &mut Matcher) -> Option<u32> {
        let mut buf = Vec::new();
        pattern.score(Utf32Str::new(text, &mut buf), matcher)
    }

    #[test]
    fn fuzzy_match_positive() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let p = Pattern::new("srch", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "Implement search", &mut matcher).is_some());
    }

    #[test]
    fn fuzzy_match_negative() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let p = Pattern::new("xyz", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "hello world", &mut matcher).is_none());
    }

    #[test]
    fn fuzzy_match_case_insensitive() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let p = Pattern::new("tAsK", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "Task", &mut matcher).is_some());
    }

    #[test]
    fn fuzzy_match_japanese() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let p = Pattern::new("本語", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "日本語", &mut matcher).is_some());
    }

    #[test]
    fn fuzzy_match_non_contiguous() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        // "Pull Request" contains 'P', then later 'R' — "PR" should match as sub-sequence.
        let p = Pattern::new("pr", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "Pull Request", &mut matcher).is_some());
    }

    #[test]
    fn fuzzy_match_empty_query_always_matches() {
        let mut matcher = Matcher::new(Config::DEFAULT);
        let p = Pattern::new("", CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        assert!(score(&p, "anything", &mut matcher).is_some());
        assert!(score(&p, "", &mut matcher).is_some());
    }

    // --- tag filters --------------------------------------------------------

    fn make_task(tags: &[&str]) -> Task {
        Task {
            id: "id".into(),
            title: "t".into(),
            status: "Todo".into(),
            body: String::new(),
            order: None,
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn tags_vec(tags: &[&str]) -> Vec<String> {
        tags.iter().map(|s| s.to_string()).collect()
    }

    fn contains(tags: &[&str]) -> TagFilter {
        TagFilter::Contains {
            tags: tags_vec(tags),
        }
    }
    fn not_contains(tags: &[&str]) -> TagFilter {
        TagFilter::NotContains {
            tags: tags_vec(tags),
        }
    }
    fn contains_any(tags: &[&str]) -> TagFilter {
        TagFilter::ContainsAny {
            tags: tags_vec(tags),
        }
    }
    fn contains_all(tags: &[&str]) -> TagFilter {
        TagFilter::ContainsAll {
            tags: tags_vec(tags),
        }
    }

    #[test]
    fn tags_contains_any_empty_targets_is_false() {
        let task_tags: Vec<String> = vec!["a".into()];
        let targets: Vec<String> = vec![];
        assert!(!tags_contains_any(&task_tags, &targets));
    }

    #[test]
    fn tags_contains_any_single_match() {
        let task_tags: Vec<String> = vec!["a".into(), "b".into()];
        let targets: Vec<String> = vec!["a".into()];
        assert!(tags_contains_any(&task_tags, &targets));
    }

    #[test]
    fn tags_contains_any_one_of_many_matches() {
        let task_tags: Vec<String> = vec!["a".into()];
        let targets: Vec<String> = vec!["x".into(), "y".into(), "a".into()];
        assert!(tags_contains_any(&task_tags, &targets));
    }

    #[test]
    fn tags_contains_any_no_match() {
        let task_tags: Vec<String> = vec!["a".into(), "b".into()];
        let targets: Vec<String> = vec!["x".into(), "y".into()];
        assert!(!tags_contains_any(&task_tags, &targets));
    }

    // matches_filter: 6 operators × tag有/無 × operand 有/空

    #[test]
    fn contains_with_match() {
        assert!(matches_filter(&make_task(&["bug", "p0"]), &contains(&["bug"])));
    }

    #[test]
    fn contains_without_match() {
        assert!(!matches_filter(&make_task(&["feature"]), &contains(&["bug"])));
    }

    #[test]
    fn contains_empty_operand_passes_all() {
        assert!(matches_filter(&make_task(&["bug"]), &contains(&[])));
        assert!(matches_filter(&make_task(&[]), &contains(&[])));
    }

    #[test]
    fn contains_is_case_sensitive() {
        assert!(!matches_filter(&make_task(&["Bug"]), &contains(&["bug"])));
    }

    #[test]
    fn not_contains_with_match_fails() {
        assert!(!matches_filter(&make_task(&["bug"]), &not_contains(&["bug"])));
    }

    #[test]
    fn not_contains_without_match_passes() {
        assert!(matches_filter(&make_task(&["feature"]), &not_contains(&["bug"])));
    }

    #[test]
    fn not_contains_empty_tags_passes() {
        assert!(matches_filter(&make_task(&[]), &not_contains(&["bug"])));
    }

    #[test]
    fn not_contains_empty_operand_passes_all() {
        assert!(matches_filter(&make_task(&["bug"]), &not_contains(&[])));
    }

    #[test]
    fn contains_any_matches_any() {
        assert!(matches_filter(&make_task(&["bug"]), &contains_any(&["bug", "feature"])));
    }

    #[test]
    fn contains_any_no_match() {
        assert!(!matches_filter(&make_task(&["docs"]), &contains_any(&["bug", "feature"])));
    }

    #[test]
    fn contains_any_empty_operand_passes_all() {
        assert!(matches_filter(&make_task(&[]), &contains_any(&[])));
    }

    #[test]
    fn contains_all_full_match() {
        assert!(matches_filter(
            &make_task(&["bug", "p0", "frontend"]),
            &contains_all(&["bug", "p0"])
        ));
    }

    #[test]
    fn contains_all_partial_match_fails() {
        assert!(!matches_filter(
            &make_task(&["bug"]),
            &contains_all(&["bug", "p0"])
        ));
    }

    #[test]
    fn contains_all_empty_operand_passes_all() {
        assert!(matches_filter(&make_task(&[]), &contains_all(&[])));
    }

    #[test]
    fn is_empty_passes_empty_tags_only() {
        assert!(matches_filter(&make_task(&[]), &TagFilter::IsEmpty));
        assert!(!matches_filter(&make_task(&["bug"]), &TagFilter::IsEmpty));
    }

    #[test]
    fn is_not_empty_passes_tagged_tasks_only() {
        assert!(!matches_filter(&make_task(&[]), &TagFilter::IsNotEmpty));
        assert!(matches_filter(&make_task(&["bug"]), &TagFilter::IsNotEmpty));
    }

    // matches_all_filters

    #[test]
    fn matches_all_filters_empty_is_true() {
        let t = make_task(&["bug"]);
        assert!(matches_all_filters(&t, &[]));
    }

    #[test]
    fn matches_all_filters_all_pass() {
        let t = make_task(&["bug", "p0"]);
        let filters = vec![contains(&["bug"]), contains(&["p0"])];
        assert!(matches_all_filters(&t, &filters));
    }

    #[test]
    fn matches_all_filters_one_fails() {
        let t = make_task(&["bug"]);
        let filters = vec![contains(&["bug"]), contains(&["p0"])];
        assert!(!matches_all_filters(&t, &filters));
    }

    // apply_query_and_filters

    fn titled_task(title: &str, tags: &[&str]) -> Task {
        Task {
            id: title.into(),
            title: title.into(),
            status: "Todo".into(),
            body: String::new(),
            order: None,
            tags: tags_vec(tags),
        }
    }

    #[test]
    fn apply_no_query_no_filters_returns_input_order() {
        let tasks = vec![
            titled_task("A", &["bug"]),
            titled_task("B", &["feature"]),
            titled_task("C", &[]),
        ];
        let result = apply_query_and_filters(tasks, None, &[]);
        assert_eq!(result.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), vec!["A", "B", "C"]);
    }

    #[test]
    fn apply_query_only_filters_by_title() {
        let tasks = vec![
            titled_task("Implement search", &[]),
            titled_task("Fix bug", &[]),
        ];
        let result = apply_query_and_filters(tasks, Some("search"), &[]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Implement search");
    }

    #[test]
    fn apply_filters_only_filters_by_tags() {
        let tasks = vec![
            titled_task("A", &["bug"]),
            titled_task("B", &["feature"]),
        ];
        let result = apply_query_and_filters(tasks, None, &[contains(&["bug"])]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "A");
    }

    #[test]
    fn apply_query_and_filters_combined_is_and() {
        let tasks = vec![
            titled_task("Fix bug", &["bug"]),
            titled_task("Fix typo", &["bug"]),
            titled_task("Fix bug", &["feature"]),
        ];
        let result = apply_query_and_filters(tasks, Some("bug"), &[contains(&["bug"])]);
        // Only "Fix bug" with tag "bug" passes both
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Fix bug");
        assert_eq!(result[0].tags, vec!["bug"]);
    }

    #[test]
    fn apply_empty_query_string_is_treated_as_no_query() {
        let tasks = vec![titled_task("anything", &[])];
        let result = apply_query_and_filters(tasks, Some(""), &[]);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn apply_preserves_input_order_after_filtering() {
        let tasks = vec![
            titled_task("Z", &["x"]),
            titled_task("A", &["x"]),
            titled_task("M", &["x"]),
        ];
        let result = apply_query_and_filters(tasks, None, &[contains(&["x"])]);
        // Order preserved as-is (caller pre-sorts)
        assert_eq!(result.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), vec!["Z", "A", "M"]);
    }

    // collect_unique_tags_sorted

    #[test]
    fn collect_tags_sorts_case_insensitively() {
        let tasks = vec![
            titled_task("a", &["Zebra"]),
            titled_task("b", &["apple"]),
            titled_task("c", &["Banana"]),
        ];
        let result = collect_unique_tags_sorted(&tasks);
        assert_eq!(result, vec!["apple", "Banana", "Zebra"]);
    }

    #[test]
    fn collect_tags_preserves_original_case() {
        let tasks = vec![titled_task("a", &["Feature"])];
        let result = collect_unique_tags_sorted(&tasks);
        assert_eq!(result, vec!["Feature"]);
    }

    #[test]
    fn collect_tags_dedups_exact_case_matches() {
        let tasks = vec![
            titled_task("a", &["bug"]),
            titled_task("b", &["bug"]),
        ];
        let result = collect_unique_tags_sorted(&tasks);
        assert_eq!(result, vec!["bug"]);
    }

    #[test]
    fn collect_tags_keeps_case_variants_separate() {
        // Bug and bug differ only in case — dedup is case-sensitive
        let tasks = vec![
            titled_task("a", &["Bug"]),
            titled_task("b", &["bug"]),
        ];
        let result = collect_unique_tags_sorted(&tasks);
        // Both kept; tiebreaker puts uppercase first ('B' < 'b' in ASCII)
        assert_eq!(result, vec!["Bug", "bug"]);
    }

    #[test]
    fn collect_tags_empty_when_no_tags() {
        let tasks = vec![titled_task("a", &[]), titled_task("b", &[])];
        let result = collect_unique_tags_sorted(&tasks);
        assert!(result.is_empty());
    }

    #[test]
    fn collect_tags_dedups_across_tasks() {
        let tasks = vec![
            titled_task("a", &["bug", "p0"]),
            titled_task("b", &["bug", "feature"]),
        ];
        let result = collect_unique_tags_sorted(&tasks);
        assert_eq!(result, vec!["bug", "feature", "p0"]);
    }
}
