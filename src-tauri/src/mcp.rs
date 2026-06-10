use crate::error::{CmdResult, CommandError};
use crate::state::AppState;
use crate::status;
use crate::task;
use crate::workspace::SETTINGS_FILE;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, Response, StatusCode};
use axum::middleware::Next;
use rand::Rng;
use rmcp::{
    handler::server::{tool::Extension, wrapper::Json, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ServerHandler,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use subtle::ConstantTimeEq;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

/// Top-level key in `settings.json` — all MCP settings nest under this single key.
const STORE_KEY: &str = "mcp";

/// The MCP HTTP server always binds to this port. The user cannot change it
/// from the UI; we still expose it through `McpStatus::Running { port }` so the
/// `mcp.json` snippet and the status badge reflect the same number.
const DEFAULT_PORT: u16 = 8569;
const MIN_TOKEN_LEN: usize = 12;
const GENERATED_TOKEN_LEN: usize = 32;
const BASE62_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/// `list_tasks` pagination bounds: default page size when `limit` is omitted,
/// and the hard ceiling a caller can request (larger values are clamped).
const DEFAULT_LIST_TASKS_LIMIT: usize = 50;
const MAX_LIST_TASKS_LIMIT: usize = 200;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpSettings {
    pub enabled: bool,
    pub token: String,
}

/// Externally-tagged enum so invalid (running=true, error=Some) etc. states
/// are unrepresentable on both the Rust and TS sides.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum McpStatus {
    Stopped,
    Running { port: u16 },
    Failed { error: String },
}

#[derive(Debug)]
pub enum McpStartError {
    PortInUse { port: u16 },
    Other(String),
}

impl std::fmt::Display for McpStartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PortInUse { port } => write!(f, "Port {port} in use"),
            Self::Other(s) => write!(f, "{s}"),
        }
    }
}

/// Process-wide runtime state of the MCP server. Held by `AppState` under a
/// `Mutex<McpRuntime>` so the three valid states (stopped / running / failed)
/// are mutually exclusive and `mcp_handle` + `last_error` can't drift apart.
pub enum McpRuntime {
    Stopped,
    Running(McpHandle),
    Failed { error: String },
}

pub struct McpHandle {
    pub(crate) cancel: CancellationToken,
    pub(crate) join: JoinHandle<()>,
    pub(crate) token: Arc<RwLock<String>>,
    pub(crate) port: u16,
}

impl McpRuntime {
    pub fn to_status(&self) -> McpStatus {
        match self {
            Self::Stopped => McpStatus::Stopped,
            Self::Running(h) => McpStatus::Running { port: h.port },
            Self::Failed { error } => McpStatus::Failed {
                error: error.clone(),
            },
        }
    }
}

/// Newtype injected into the HTTP request extensions by `workspace_layer`
/// and extracted by `list_tasks`. Kept `pub(crate)` (along with both the
/// constructor and accessor) so the "canonicalized + exists" invariant lives
/// in a single place — middleware is the only minting site.
#[derive(Clone, Debug)]
pub(crate) struct Workspace(PathBuf);

impl Workspace {
    pub(crate) fn new(canonical_dir: PathBuf) -> Self {
        Self(canonical_dir)
    }

    pub(crate) fn as_path(&self) -> &std::path::Path {
        &self.0
    }
}

/// Minimal task representation returned over MCP. Intentionally drops `body` /
/// `order` from `Task` to produce a lightweight LLM-oriented DTO.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct McpTask {
    pub title: String,
    pub file_path: String,
    pub status: String,
    pub tags: Vec<String>,
}

/// Output wrapper for `list_tasks`.
///
/// The MCP spec requires the `outputSchema` root to be `object`, so the page
/// lives under `tasks`. `has_more` tells the caller whether to fetch the next
/// page (re-call with `offset` advanced by `limit`).
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct ListTasksOutput {
    pub tasks: Vec<McpTask>,
    /// Whether more tasks remain beyond this page.
    pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksInput {
    /// Fuzzy-search tasks by title.
    pub query: Option<String>,
    /// Filter by tag conditions. Operators: `contains`, `not_contains`, `contains_any`, `contains_all`, `is_empty`, `is_not_empty`.
    pub filters: Option<Vec<McpTagFilter>>,
    /// Filter by exact status match (e.g. "Todo", "Doing", "Done").
    pub status: Option<String>,
    /// Maximum number of tasks to return. Defaults to 50, capped at 200.
    pub limit: Option<u32>,
    /// Number of matching tasks to skip. Defaults to 0. To page, advance by `limit` while `has_more` is true.
    pub offset: Option<u32>,
}

/// A single tag filter condition. Combine multiple filters to narrow results.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "operator", rename_all = "snake_case")]
pub enum McpTagFilter {
    Contains { tags: Vec<String> },
    NotContains { tags: Vec<String> },
    ContainsAny { tags: Vec<String> },
    ContainsAll { tags: Vec<String> },
    IsEmpty,
    IsNotEmpty,
}

// ---------------------------------------------------------------------------
// MCP tool: list_statuses types
// ---------------------------------------------------------------------------

/// A status entry returned over MCP.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct McpStatusEntry {
    pub label: String,
}

/// Output wrapper for `list_statuses`.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct ListStatusesOutput {
    pub statuses: Vec<McpStatusEntry>,
}

#[derive(Clone, Debug, Deserialize, schemars::JsonSchema)]
pub struct ListStatusesInput {}

// ---------------------------------------------------------------------------
// MCP tool: list_tags types
// ---------------------------------------------------------------------------

/// A single tag entry returned over MCP.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct McpTagEntry {
    pub name: String,
}

/// Output wrapper for `list_tags`.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct ListTagsOutput {
    pub tags: Vec<McpTagEntry>,
}

#[derive(Clone, Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTagsInput {}

// ---------------------------------------------------------------------------
// MCP tool: create_task types
// ---------------------------------------------------------------------------

/// Output wrapper for `create_task`.
#[derive(Clone, Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskOutput {
    pub task: McpTask,
}

#[derive(Clone, Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskInput {
    /// Task title.
    pub title: String,
    /// Status column label (e.g. "Todo", "Doing", "Done"). Use `list_statuses` to discover valid status values for the workspace.
    pub status: String,
    /// Optional tags.
    pub tags: Option<Vec<String>>,
    /// Optional markdown body.
    pub body: Option<String>,
}

impl From<McpTagFilter> for task::TagFilter {
    fn from(f: McpTagFilter) -> Self {
        match f {
            McpTagFilter::Contains { tags } => task::TagFilter::Contains { tags },
            McpTagFilter::NotContains { tags } => task::TagFilter::NotContains { tags },
            McpTagFilter::ContainsAny { tags } => task::TagFilter::ContainsAny { tags },
            McpTagFilter::ContainsAll { tags } => task::TagFilter::ContainsAll { tags },
            McpTagFilter::IsEmpty => task::TagFilter::IsEmpty,
            McpTagFilter::IsNotEmpty => task::TagFilter::IsNotEmpty,
        }
    }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Generate a fresh random Bearer token (32-char base62 from `OsRng`).
///
/// Named `mint_token` rather than `generate_token` to keep the room free for
/// the Tauri command of the same wire name (`generate_token`) — `#[tauri::command]`
/// uses the Rust function name as the IPC name, so the helper and the command
/// can't share an identifier.
pub fn mint_token() -> String {
    let mut rng = rand::rng();
    (0..GENERATED_TOKEN_LEN)
        .map(|_| {
            let idx = rng.random_range(0..BASE62_ALPHABET.len());
            BASE62_ALPHABET[idx] as char
        })
        .collect()
}

#[derive(Debug, PartialEq, Eq)]
pub enum TokenValidationError {
    TooShort,
}

impl std::fmt::Display for TokenValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(f, "Token must be at least {MIN_TOKEN_LEN} characters"),
        }
    }
}

pub fn validate_token(s: &str) -> Result<(), TokenValidationError> {
    if s.chars().count() < MIN_TOKEN_LEN {
        return Err(TokenValidationError::TooShort);
    }
    Ok(())
}

/// Generate a slug from a workspace name (replace non-`[a-zA-Z0-9_-]` with `-`,
/// collapse consecutive dashes, trim both ends).
pub fn slug_for_workspace(path: &std::path::Path) -> String {
    let basename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("workspace");

    let mut out = String::with_capacity(basename.len());
    let mut prev_dash = false;
    for ch in basename.chars() {
        let keep = ch.is_ascii_alphanumeric() || ch == '_' || ch == '-';
        if keep {
            out.push(ch);
            prev_dash = ch == '-';
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "workspace".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Stable 16-bit hash for disambiguating same-basename workspaces in the
/// generated `mcp.json` snippet. `DefaultHasher` is SipHash with a per-process
/// random seed, so the suffix would shift across restarts and rot a snippet
/// the user already pasted into their MCP client config. FNV-1a is
/// deterministic.
fn stable_short_hash(s: &str) -> u16 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    (h & 0xffff) as u16
}

/// Build the `mcp.json` snippet that Claude Desktop / Code paste. Pure; takes
/// open workspaces + the current port + token.
pub fn build_sample_config(open_workspaces: &[PathBuf], port: u16, token: &str) -> String {
    if open_workspaces.is_empty() {
        return "{}".to_string();
    }
    let mut servers = serde_json::Map::new();
    for ws in open_workspaces {
        let slug = slug_for_workspace(ws);
        let key = if servers.contains_key(&format!("cork-{slug}")) {
            format!(
                "cork-{slug}-{:04x}",
                stable_short_hash(&ws.to_string_lossy())
            )
        } else {
            format!("cork-{slug}")
        };
        let mut headers = serde_json::Map::new();
        headers.insert(
            "Authorization".to_string(),
            serde_json::json!(format!("Bearer {token}")),
        );
        headers.insert(
            "X-Cork-Workspace".to_string(),
            serde_json::json!(ws.to_string_lossy().to_string()),
        );
        let entry = serde_json::json!({
            "type": "http",
            "url": format!("http://127.0.0.1:{port}/mcp"),
            "headers": headers,
        });
        servers.insert(key, entry);
    }
    let root = serde_json::json!({ "mcpServers": serde_json::Value::Object(servers) });
    serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".to_string())
}

/// Extracted so `update_settings`'s diff logic can be tested without a Tauri
/// runtime. Returns `true` only when the runtime is currently `Running` and
/// the user keeps `enabled = true` — the only thing left to change is the
/// token, which we hot-swap rather than restart for.
fn is_token_only_change(was_running: bool, next: &McpSettings) -> bool {
    was_running && next.enabled
}

/// Resolve the caller's `limit` into an effective page size: `None` falls back
/// to the default, any explicit value is clamped to `1..=MAX_LIST_TASKS_LIMIT`.
fn resolve_limit(requested: Option<u32>) -> usize {
    match requested {
        None => DEFAULT_LIST_TASKS_LIMIT,
        Some(n) => (n as usize).clamp(1, MAX_LIST_TASKS_LIMIT),
    }
}

/// Slice a filtered task list into one page. `limit` is assumed pre-clamped
/// via `resolve_limit`; an `offset` past the end yields an empty page.
fn paginate(tasks: Vec<McpTask>, offset: usize, limit: usize) -> ListTasksOutput {
    let total = tasks.len();
    let page: Vec<McpTask> = tasks.into_iter().skip(offset).take(limit).collect();
    let has_more = offset.saturating_add(page.len()) < total;
    ListTasksOutput {
        tasks: page,
        has_more,
    }
}

// ---------------------------------------------------------------------------
// Settings store
// ---------------------------------------------------------------------------

pub fn load_settings(app: &tauri::AppHandle) -> McpSettings {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        // Without a store handle we can't persist anyway; return ephemeral
        // defaults so the rest of `setup` can continue. The next launch
        // will retry the store open.
        return resolve_settings(None).0;
    };
    let parsed = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value::<McpSettings>(v).ok());

    let had_invalid_token = parsed
        .as_ref()
        .is_some_and(|s| validate_token(&s.token).is_err());
    if had_invalid_token {
        eprintln!("persisted MCP token failed `validate_token`; rotating to a fresh CSRNG token",);
    }

    let (settings, needs_write) = resolve_settings(parsed);
    if needs_write {
        if let Ok(value) = serde_json::to_value(&settings) {
            store.set(STORE_KEY, value);
            if let Err(e) = store.save() {
                // Matches the existing `workspace.rs` pattern (see
                // `seed_window_from_history`): surface the failure without
                // blocking the app from booting, but don't swallow it
                // silently.
                eprintln!("failed to persist initial MCP settings: {e}");
            }
        }
    }
    settings
}

pub fn save_settings(app: &tauri::AppHandle, settings: &McpSettings) -> CmdResult<()> {
    let store = app.store(SETTINGS_FILE).map_err(CommandError::other)?;
    let value = serde_json::to_value(settings).map_err(CommandError::other)?;
    store.set(STORE_KEY, value);
    store.save().map_err(CommandError::other)?;
    Ok(())
}

/// Resolve `(McpSettings, needs_persist)` from a parsed (or absent) store entry.
///
/// Two callsites share this: the cold-start path (`parsed = None`) and the
/// corrupt-token rotation path (`parsed = Some(s)` with `validate_token(s)`
/// failing). Both end up in the rotate branch, but the rotate branch
/// preserves the user's `enabled` choice when one was parsed — so a
/// hand-edited `settings.json` with a 3-char token and `enabled: true`
/// produces a fresh CSRNG token AND keeps the server attempt-to-start
/// behaviour the user last asked for. They'll notice the rotated token
/// because their existing mcp.json client config breaks.
fn resolve_settings(parsed: Option<McpSettings>) -> (McpSettings, bool) {
    if let Some(s) = parsed.as_ref() {
        if validate_token(&s.token).is_ok() {
            return (s.clone(), false);
        }
    }
    let next = McpSettings {
        enabled: parsed.as_ref().is_some_and(|s| s.enabled),
        token: mint_token(),
    };
    (next, true)
}

// ---------------------------------------------------------------------------
// MCP service
// ---------------------------------------------------------------------------

/// Stateless MCP server type. Per-session instances are minted by the
/// `StreamableHttpService` factory closure in `start`; nothing here needs
/// to outlive a single request, so the struct carries no state.
///
/// Tool dispatch flows through `#[tool_router]` (defines `list_tasks`) and
/// `#[tool_handler]` (wires the trait methods rmcp's transport actually
/// calls — `call_tool` / `list_tools` / `get_tool`). Skip either macro and
/// the server still starts, but `tools/list` silently returns `[]` and
/// `tools/call` returns `method_not_found` — the entire v1 feature set
/// would be unreachable.
#[derive(Clone, Default)]
pub struct CorkMcpServer;

#[tool_router]
impl CorkMcpServer {
    #[tool(
        name = "list_tasks",
        description = "List Cork tasks in the workspace."
    )]
    async fn list_tasks(
        &self,
        Parameters(input): Parameters<ListTasksInput>,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<Json<ListTasksOutput>, rmcp::ErrorData> {
        let workspace = parts
            .extensions
            .get::<Workspace>()
            .cloned()
            .ok_or_else(|| {
                rmcp::ErrorData::invalid_params(
                    "workspace not bound to this session; middleware did not run",
                    None,
                )
            })?;
        let tasks = task::read_all_tasks(workspace.as_path());
        let filters: Vec<task::TagFilter> = input
            .filters
            .unwrap_or_default()
            .into_iter()
            .map(Into::into)
            .collect();
        let filtered = task::apply_query_and_filters(tasks, input.query.as_deref(), &filters);
        let matched: Vec<McpTask> = filtered
            .into_iter()
            .filter(|t| input.status.as_ref().is_none_or(|s| t.status == *s))
            .map(|t| McpTask {
                title: t.title,
                file_path: t.id,
                status: t.status,
                tags: t.tags,
            })
            .collect();
        let limit = resolve_limit(input.limit);
        let offset = input.offset.unwrap_or(0) as usize;
        Ok(Json(paginate(matched, offset, limit)))
    }

    #[tool(
        name = "list_statuses",
        description = "List all status columns defined in the Cork workspace."
    )]
    async fn list_statuses(
        &self,
        Parameters(_input): Parameters<ListStatusesInput>,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<Json<ListStatusesOutput>, rmcp::ErrorData> {
        let workspace = parts
            .extensions
            .get::<Workspace>()
            .cloned()
            .ok_or_else(|| {
                rmcp::ErrorData::invalid_params(
                    "workspace not bound to this session; middleware did not run",
                    None,
                )
            })?;
        let statuses = status::read_statuses_from_workspace(workspace.as_path())
            .unwrap_or_default();
        let out: Vec<McpStatusEntry> = statuses
            .into_iter()
            .map(|s| McpStatusEntry { label: s.label })
            .collect();
        Ok(Json(ListStatusesOutput { statuses: out }))
    }

    #[tool(
        name = "list_tags",
        description = "List all tags used across tasks in the Cork workspace."
    )]
    async fn list_tags(
        &self,
        Parameters(_input): Parameters<ListTagsInput>,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<Json<ListTagsOutput>, rmcp::ErrorData> {
        let workspace = parts
            .extensions
            .get::<Workspace>()
            .cloned()
            .ok_or_else(|| {
                rmcp::ErrorData::invalid_params(
                    "workspace not bound to this session; middleware did not run",
                    None,
                )
            })?;
        let tasks = task::read_all_tasks(workspace.as_path());
        let tags = task::collect_unique_tags_sorted(&tasks);
        let out: Vec<McpTagEntry> = tags
            .into_iter()
            .map(|t| McpTagEntry { name: t })
            .collect();
        Ok(Json(ListTagsOutput { tags: out }))
    }

    #[tool(
        name = "create_task",
        description = "Create a new task in the Cork workspace."
    )]
    async fn create_task(
        &self,
        Parameters(input): Parameters<CreateTaskInput>,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<Json<CreateTaskOutput>, rmcp::ErrorData> {
        let workspace = parts
            .extensions
            .get::<Workspace>()
            .cloned()
            .ok_or_else(|| {
                rmcp::ErrorData::invalid_params(
                    "workspace not bound to this session; middleware did not run",
                    None,
                )
            })?;

        // Compute order: place at the top of the status column (same as GUI).
        let existing = task::read_all_tasks(workspace.as_path());
        let order = existing
            .iter()
            .filter(|t| t.status == input.status)
            .filter_map(|t| t.order)
            .fold(f64::INFINITY, f64::min);
        let order = if order == f64::INFINITY {
            0.0
        } else {
            order - 1.0
        };

        let body = input.body.unwrap_or_default();
        let created =
            task::write_task_file(workspace.as_path(), &input.title, &input.status, &body, Some(order), input.tags)
                .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;

        Ok(Json(CreateTaskOutput {
            task: McpTask {
                title: created.title,
                file_path: created.id,
                status: created.status,
                tags: created.tags,
            },
        }))
    }
}

#[tool_handler]
impl ServerHandler for CorkMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(
                "Cork — a local Markdown Kanban board. Use `list_tasks` to read tasks, `create_task` to create a new task, `list_statuses` to list status columns, and `list_tags` to list all tags from the workspace.",
            )
    }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/// Axum middleware that validates `Authorization: Bearer <token>`.
/// Uses constant-time comparison (`subtle::ConstantTimeEq`) to avoid timing attacks.
pub async fn auth_layer(
    State(token): State<Arc<RwLock<String>>>,
    req: Request,
    next: Next,
) -> Response<Body> {
    let header = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    let supplied = match header.and_then(|h| h.strip_prefix("Bearer ")) {
        Some(s) => s,
        None => return unauthorized(),
    };

    // Recover from poison — see the matching `unwrap_or_else` in
    // `update_settings`. A poisoned `RwLock<String>` still holds a valid
    // `String`; returning 401 here would lock out the user every time
    // they hit the auth layer until they restart Cork.
    let stored = token.read().unwrap_or_else(|p| p.into_inner()).clone();
    let ok: bool = supplied.as_bytes().ct_eq(stored.as_bytes()).into();
    if !ok {
        return unauthorized();
    }

    next.run(req).await
}

fn unauthorized() -> Response<Body> {
    let mut resp = Response::new(Body::from("unauthorized"));
    *resp.status_mut() = StatusCode::UNAUTHORIZED;
    resp.headers_mut().insert(
        axum::http::header::WWW_AUTHENTICATE,
        HeaderValue::from_static("Bearer"),
    );
    resp
}

pub async fn workspace_layer(mut req: Request, next: Next) -> Response<Body> {
    let raw = req
        .headers()
        .get("X-Cork-Workspace")
        .and_then(|v| v.to_str().ok());
    let raw = match raw {
        Some(s) if !s.is_empty() => s.to_string(),
        Some(_) => return bad_request("X-Cork-Workspace header is empty"),
        None => return bad_request("X-Cork-Workspace header is required"),
    };

    // `tokio::fs::canonicalize` (vs. `std::fs::canonicalize`) hands the
    // blocking syscall off to a Tokio blocking pool thread so we don't pin
    // an async worker on disk I/O — middleware sits in the request hot path
    // and any blocking here would queue other concurrent MCP sessions
    // behind it on the multi-threaded runtime.
    let canonical = match tokio::fs::canonicalize(PathBuf::from(&raw)).await {
        Ok(p) => p,
        Err(_) => return bad_request(&format!("X-Cork-Workspace path not found: {raw}")),
    };
    // `metadata` is the async sibling of `is_dir` — same reason as above.
    let is_dir = tokio::fs::metadata(&canonical)
        .await
        .map(|m| m.is_dir())
        .unwrap_or(false);
    if !is_dir {
        return bad_request(&format!("X-Cork-Workspace is not a directory: {raw}"));
    }

    req.extensions_mut().insert(Workspace::new(canonical));
    next.run(req).await
}

fn bad_request(msg: &str) -> Response<Body> {
    let mut resp = Response::new(Body::from(msg.to_string()));
    *resp.status_mut() = StatusCode::BAD_REQUEST;
    resp
}

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

/// Bind the MCP HTTP listener and spawn the axum serve task.
///
/// `async` despite having no `.await` in the body: both
/// `tokio::net::TcpListener::from_std` and the internal `tokio::spawn` reach
/// `Handle::current()` and will panic if called from a non-runtime thread
/// (which is exactly where Tauri's `setup` hook lives). The async signature
/// encodes that "must run inside a Tokio runtime" contract in the type, so
/// callers naturally drive it via `block_on` / `.await` from a runtime
/// context.
pub async fn start(settings: &McpSettings) -> Result<McpHandle, McpStartError> {
    let token = Arc::new(RwLock::new(settings.token.clone()));
    let port = DEFAULT_PORT;
    let cancel = CancellationToken::new();

    let config = StreamableHttpServerConfig::default()
        .with_stateful_mode(true)
        .with_cancellation_token(cancel.clone());
    let mcp_service: StreamableHttpService<CorkMcpServer, LocalSessionManager> =
        StreamableHttpService::new(|| Ok(CorkMcpServer), Default::default(), config);

    let router = axum::Router::new()
        .nest_service("/mcp", mcp_service)
        .layer(axum::middleware::from_fn(workspace_layer))
        .layer(axum::middleware::from_fn_with_state(
            token.clone(),
            auth_layer,
        ));

    let listener =
        std::net::TcpListener::bind(format!("127.0.0.1:{port}")).map_err(|e| match e.kind() {
            std::io::ErrorKind::AddrInUse => McpStartError::PortInUse { port },
            _ => McpStartError::Other(e.to_string()),
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| McpStartError::Other(e.to_string()))?;

    let tokio_listener = tokio::net::TcpListener::from_std(listener)
        .map_err(|e| McpStartError::Other(e.to_string()))?;

    let cancel_clone = cancel.clone();
    let join = tokio::spawn(async move {
        let _ = axum::serve(tokio_listener, router)
            .with_graceful_shutdown(async move { cancel_clone.cancelled().await })
            .await;
    });

    Ok(McpHandle {
        cancel,
        join,
        token,
        port,
    })
}

pub async fn stop(handle: McpHandle) {
    handle.cancel.cancel();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), handle.join).await;
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> McpSettings {
    load_settings(&app)
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: McpSettings,
) -> CmdResult<McpStatus> {
    // Boundary validation. Frontend prevents short tokens from reaching here,
    // but a direct IPC call (or future external caller) could still supply
    // one, so we reject at the edge.
    validate_token(&settings.token).map_err(CommandError::other)?;
    save_settings(&app, &settings)?;

    let was_running = state.is_mcp_running();
    if is_token_only_change(was_running, &settings) {
        state.with_mcp_handle(|h| {
            // Recover from `PoisonError` rather than silently dropping the
            // write: an `Err` here means a previous holder panicked while
            // the guard was live, but the stored `String` itself is still
            // a valid `String`. Discarding the write would leave the
            // running server authenticating with the old token even though
            // the persisted settings now show the new one — the user would
            // see "Generate succeeded" in the UI while their fresh
            // `mcp.json` snippet silently fails to authenticate.
            let mut guard = h.token.write().unwrap_or_else(|p| p.into_inner());
            *guard = settings.token.clone();
        });
        return Ok(state.mcp_status());
    }

    if let Some(handle) = state.take_mcp_handle() {
        stop(handle).await;
    }

    if !settings.enabled {
        state.set_mcp_runtime(McpRuntime::Stopped);
        return Ok(state.mcp_status());
    }

    match start(&settings).await {
        Ok(handle) => state.set_mcp_runtime(McpRuntime::Running(handle)),
        Err(e) => state.set_mcp_runtime(McpRuntime::Failed {
            error: e.to_string(),
        }),
    }
    Ok(state.mcp_status())
}

#[tauri::command]
pub fn generate_token() -> String {
    mint_token()
}

#[tauri::command]
pub fn get_sample_config(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> String {
    let settings = load_settings(&app);

    let mut paths: BTreeSet<PathBuf> = BTreeSet::new();
    for (label, _w) in app.webview_windows() {
        if let Some(dir) = state.workspace(&label) {
            paths.insert(dir);
        }
    }
    let list: Vec<PathBuf> = paths.into_iter().collect();
    build_sample_config(&list, DEFAULT_PORT, &settings.token)
}

#[tauri::command]
pub fn get_server_status(state: tauri::State<'_, AppState>) -> McpStatus {
    state.mcp_status()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn mint_token_yields_expected_length_and_charset() {
        let t = mint_token();
        assert_eq!(t.len(), GENERATED_TOKEN_LEN);
        assert!(t.chars().all(|c| BASE62_ALPHABET.contains(&(c as u8))));
    }

    #[test]
    fn mint_token_is_unique_across_calls() {
        let mut seen: HashSet<String> = HashSet::new();
        for _ in 0..256 {
            let t = mint_token();
            assert!(seen.insert(t), "duplicate generated within 256 samples");
        }
    }

    #[test]
    fn validate_token_rejects_below_min_len() {
        assert_eq!(
            validate_token(&"x".repeat(MIN_TOKEN_LEN - 1)),
            Err(TokenValidationError::TooShort)
        );
    }

    #[test]
    fn validate_token_accepts_at_min_len() {
        assert!(validate_token(&"x".repeat(MIN_TOKEN_LEN)).is_ok());
    }

    #[test]
    fn validate_token_accepts_long_token() {
        assert!(validate_token(&"x".repeat(MIN_TOKEN_LEN * 4)).is_ok());
    }

    #[test]
    fn mcp_settings_roundtrip() {
        // Token value is a low-entropy placeholder (not a real secret) to
        // avoid tripping `gitleaks` while still exercising the serde
        // round-trip — the assertion only cares that the same string comes
        // back out, not that it looks like a real CSRNG token.
        let s = McpSettings {
            enabled: true,
            token: "x".repeat(MIN_TOKEN_LEN),
        };
        let json = serde_json::to_string(&s).unwrap();
        let parsed: McpSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, s);
    }

    #[test]
    fn slug_basic_ascii() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/personal")),
            "personal"
        );
    }

    #[test]
    fn slug_replaces_space_with_dash() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/my work")),
            "my-work"
        );
    }

    #[test]
    fn slug_replaces_non_ascii_with_dash() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/プロジェクト")),
            "workspace"
        );
    }

    #[test]
    fn slug_collapses_repeated_dashes() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/a  b")),
            "a-b"
        );
    }

    #[test]
    fn slug_trims_edge_dashes() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/-foo-")),
            "foo"
        );
    }

    #[test]
    fn slug_keeps_underscore_and_dash() {
        assert_eq!(
            slug_for_workspace(std::path::Path::new("/Users/koki/a_b-c")),
            "a_b-c"
        );
    }

    #[test]
    fn build_sample_config_empty() {
        assert_eq!(build_sample_config(&[], 8569, "tok"), "{}");
    }

    #[test]
    fn build_sample_config_single_workspace() {
        let s = build_sample_config(
            &[PathBuf::from("/Users/alice/notes")],
            8569,
            "tok123456789012",
        );
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        let entry = &v["mcpServers"]["cork-notes"];
        assert_eq!(entry["type"], "http");
        assert_eq!(entry["url"], "http://127.0.0.1:8569/mcp");
        assert_eq!(entry["headers"]["Authorization"], "Bearer tok123456789012");
        assert_eq!(entry["headers"]["X-Cork-Workspace"], "/Users/alice/notes");
    }

    #[test]
    fn build_sample_config_multiple_workspaces() {
        let s = build_sample_config(
            &[
                PathBuf::from("/Users/alice/personal"),
                PathBuf::from("/Users/alice/work"),
            ],
            9000,
            "tok",
        );
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        let servers = v["mcpServers"].as_object().unwrap();
        assert_eq!(servers.len(), 2);
        assert!(servers.contains_key("cork-personal"));
        assert!(servers.contains_key("cork-work"));
    }

    #[test]
    fn build_sample_config_disambiguates_duplicate_slugs() {
        let s = build_sample_config(
            &[
                PathBuf::from("/Users/alice/notes"),
                PathBuf::from("/Users/bob/notes"),
            ],
            8569,
            "tok",
        );
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        let servers = v["mcpServers"].as_object().unwrap();
        assert_eq!(
            servers.len(),
            2,
            "two workspaces with the same basename must produce two entries"
        );
        // The canonical key wins; the second goes through stable_short_hash.
        assert!(servers.contains_key("cork-notes"));
        let suffixed_key = servers
            .keys()
            .find(|k| k.as_str() != "cork-notes")
            .expect("a suffixed key must exist");
        assert!(
            suffixed_key.starts_with("cork-notes-")
                && suffixed_key.len() == "cork-notes-".len() + 4,
            "second entry must use the 4-hex-digit fnv suffix, got: {suffixed_key}"
        );
    }

    #[test]
    fn build_sample_config_disambiguation_is_stable() {
        // The same input must produce byte-identical output across calls.
        // DefaultHasher's per-process random seed would break this; FNV-1a
        // does not. Guards against a future refactor regressing to SipHash.
        let workspaces = [
            PathBuf::from("/Users/alice/notes"),
            PathBuf::from("/Users/bob/notes"),
        ];
        let first = build_sample_config(&workspaces, 8569, "tok");
        let second = build_sample_config(&workspaces, 8569, "tok");
        assert_eq!(first, second);
    }

    // -- McpRuntime -------------------------------------------------------------

    #[test]
    fn mcp_runtime_status_stopped() {
        assert_eq!(McpRuntime::Stopped.to_status(), McpStatus::Stopped);
    }

    #[test]
    fn mcp_runtime_status_failed() {
        let r = McpRuntime::Failed {
            error: "Port 8569 in use".to_string(),
        };
        assert_eq!(
            r.to_status(),
            McpStatus::Failed {
                error: "Port 8569 in use".to_string()
            },
        );
    }

    #[test]
    fn mcp_runtime_status_running() {
        // Build a real McpHandle so the Running arm is exercised end-to-end.
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
        let r = McpRuntime::Running(handle);
        assert_eq!(r.to_status(), McpStatus::Running { port: 9001 });
    }

    // -- McpStartError ----------------------------------------------------------

    #[test]
    fn mcp_start_error_display() {
        assert_eq!(
            McpStartError::PortInUse { port: 8569 }.to_string(),
            "Port 8569 in use"
        );
        assert_eq!(McpStartError::Other("boom".to_string()).to_string(), "boom");
    }

    // -- McpStatus serialization (tagged enum wire format) ---------------------

    #[test]
    fn mcp_status_serializes_as_tagged_enum() {
        assert_eq!(
            serde_json::to_value(McpStatus::Stopped).unwrap(),
            serde_json::json!({ "kind": "stopped" }),
        );
        assert_eq!(
            serde_json::to_value(McpStatus::Running { port: 8569 }).unwrap(),
            serde_json::json!({ "kind": "running", "port": 8569 }),
        );
        assert_eq!(
            serde_json::to_value(McpStatus::Failed {
                error: "Port 8569 in use".to_string()
            })
            .unwrap(),
            serde_json::json!({
                "kind": "failed",
                "error": "Port 8569 in use"
            }),
        );
    }

    // -- is_token_only_change --------------------------------------------------

    fn ms(enabled: bool, token: &str) -> McpSettings {
        McpSettings {
            enabled,
            token: token.to_string(),
        }
    }

    #[test]
    fn token_only_when_running_and_staying_enabled() {
        assert!(is_token_only_change(true, &ms(true, "new0123456789")));
    }

    #[test]
    fn not_token_only_when_not_running() {
        // Failed / Stopped → was_running = false → must restart, not swap.
        assert!(!is_token_only_change(false, &ms(true, "new0123456789")));
    }

    #[test]
    fn not_token_only_when_disabling() {
        assert!(!is_token_only_change(true, &ms(false, "tok0123456789")));
    }

    // -- Workspace newtype -----------------------------------------------------

    #[test]
    fn workspace_round_trips_through_new_and_as_path() {
        let p = PathBuf::from("/tmp/cork-test");
        let w = Workspace::new(p.clone());
        assert_eq!(w.as_path(), p.as_path());
    }

    // -- Tool registration (MCP spec compliance) -------------------------------

    #[test]
    fn tool_router_registers_without_panicking_on_output_schema() {
        // `#[tool_router]` macro generates `Self::tool_router()` which calls
        // `Self::list_tasks_tool_attr()` — the latter materializes the tool's
        // input/output JSON schemas and asserts MCP's "outputSchema root must
        // be 'object'" requirement at runtime. Returning `Json<Vec<McpTask>>`
        // straight (without the `ListTasksOutput` wrapper) panics here. This
        // test is the first line of defense before that panic surfaces only
        // at server start.
        let router = CorkMcpServer::tool_router();
        // Sanity: the list_tasks tool is actually registered (vs. having
        // skipped registration silently due to some other macro misuse).
        let names: Vec<String> = router
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        assert!(
            names.iter().any(|n| n == "list_tasks"),
            "list_tasks must be registered; got {names:?}",
        );
        assert!(
            names.iter().any(|n| n == "list_tags"),
            "list_tags must be registered; got {names:?}",
        );
        assert!(
            names.iter().any(|n| n == "create_task"),
            "create_task must be registered; got {names:?}",
        );
    }

    #[test]
    fn list_tasks_output_schema_root_is_object() {
        // Belt-and-suspenders: explicitly check the schema's root type so a
        // future return-type refactor (e.g. removing the wrapper) can't
        // sneak in past `tool_router_registers_without_panicking_on_output_schema`
        // if rmcp's internal assertion ever changes.
        let schema = schemars::schema_for!(ListTasksOutput);
        let root_type = schema
            .as_value()
            .get("type")
            .and_then(|v| v.as_str())
            .map(str::to_owned);
        assert_eq!(root_type.as_deref(), Some("object"));
    }

    #[test]
    fn list_tags_output_schema_root_is_object() {
        let schema = schemars::schema_for!(ListTagsOutput);
        let root_type = schema
            .as_value()
            .get("type")
            .and_then(|v| v.as_str())
            .map(str::to_owned);
        assert_eq!(root_type.as_deref(), Some("object"));
    }

    #[test]
    fn create_task_output_schema_root_is_object() {
        let schema = schemars::schema_for!(CreateTaskOutput);
        let root_type = schema
            .as_value()
            .get("type")
            .and_then(|v| v.as_str())
            .map(str::to_owned);
        assert_eq!(root_type.as_deref(), Some("object"));
    }

    // -- McpTagFilter ----------------------------------------------------------

    fn mcp_contains(tags: &[&str]) -> McpTagFilter {
        McpTagFilter::Contains {
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }
    fn mcp_not_contains(tags: &[&str]) -> McpTagFilter {
        McpTagFilter::NotContains {
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }
    fn mcp_contains_any(tags: &[&str]) -> McpTagFilter {
        McpTagFilter::ContainsAny {
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }
    fn mcp_contains_all(tags: &[&str]) -> McpTagFilter {
        McpTagFilter::ContainsAll {
            tags: tags.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn mcp_tag_filter_round_trips_all_variants() {
        let cases: Vec<(McpTagFilter, serde_json::Value)> = vec![
            (
                mcp_contains(&["bug"]),
                serde_json::json!({ "operator": "contains", "tags": ["bug"] }),
            ),
            (
                mcp_not_contains(&["feature"]),
                serde_json::json!({ "operator": "not_contains", "tags": ["feature"] }),
            ),
            (
                mcp_contains_any(&["a", "b"]),
                serde_json::json!({ "operator": "contains_any", "tags": ["a", "b"] }),
            ),
            (
                mcp_contains_all(&["x", "y", "z"]),
                serde_json::json!({ "operator": "contains_all", "tags": ["x", "y", "z"] }),
            ),
            (
                McpTagFilter::IsEmpty,
                serde_json::json!({ "operator": "is_empty" }),
            ),
            (
                McpTagFilter::IsNotEmpty,
                serde_json::json!({ "operator": "is_not_empty" }),
            ),
        ];
        for (filter, expected) in cases {
            let json = serde_json::to_value(&filter).unwrap();
            assert_eq!(json, expected, "serialize: {filter:?}");
            let deserialized: McpTagFilter = serde_json::from_value(json).unwrap();
            assert_eq!(deserialized, filter, "round trip: {filter:?}");
        }
    }

    #[test]
    fn mcp_tag_filter_from_converts_all_variants() {
        fn roundtrip(mcp: McpTagFilter) {
            let task_filter: task::TagFilter = mcp.clone().into();
            let mcp_back: McpTagFilter = {
                // Re-encode through task::TagFilter → serde_value to compare
                let tv = serde_json::to_value(&task_filter).unwrap();
                serde_json::from_value(tv).unwrap()
            };
            assert_eq!(mcp_back, mcp, "conversion round-trip: {mcp:?}");
        }
        roundtrip(mcp_contains(&["bug"]));
        roundtrip(mcp_not_contains(&["feature"]));
        roundtrip(mcp_contains_any(&["a"]));
        roundtrip(mcp_contains_all(&["x", "y"]));
        roundtrip(McpTagFilter::IsEmpty);
        roundtrip(McpTagFilter::IsNotEmpty);
    }

    // -- ListTasksInput --------------------------------------------------------

    #[test]
    fn list_tasks_input_deserializes_full_payload() {
        let json = serde_json::json!({
            "query": "search text",
            "filters": [
                { "operator": "contains", "tags": ["bug"] },
                { "operator": "is_not_empty" },
            ],
            "status": "Doing",
        });
        let input: ListTasksInput = serde_json::from_value(json).unwrap();
        assert_eq!(input.query.as_deref(), Some("search text"));
        assert_eq!(input.filters.as_ref().map(|v| v.len()), Some(2));
        assert_eq!(input.status.as_deref(), Some("Doing"));
    }

    #[test]
    fn list_tasks_input_deserializes_empty_object() {
        let input: ListTasksInput = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(input.query.is_none());
        assert!(input.filters.is_none());
        assert!(input.status.is_none());
    }

    #[test]
    fn list_tasks_input_deserializes_partial_query_only() {
        let input: ListTasksInput =
            serde_json::from_value(serde_json::json!({ "query": "foo" })).unwrap();
        assert_eq!(input.query.as_deref(), Some("foo"));
        assert!(input.filters.is_none());
        assert!(input.status.is_none());
    }

    #[test]
    fn list_tasks_input_deserializes_partial_filters_only() {
        let input: ListTasksInput = serde_json::from_value(serde_json::json!({
            "filters": [{ "operator": "is_empty" }],
        }))
        .unwrap();
        assert!(input.query.is_none());
        assert_eq!(input.filters.as_ref().map(|v| v.len()), Some(1));
        assert!(input.status.is_none());
    }

    #[test]
    fn list_tasks_input_accepts_null_fields() {
        let input: ListTasksInput = serde_json::from_value(serde_json::json!({
            "query": null, "filters": null, "status": null
        }))
        .unwrap();
        assert!(input.query.is_none());
        assert!(input.filters.is_none());
        assert!(input.status.is_none());
    }

    #[test]
    fn list_tasks_input_deserializes_with_status_only() {
        let input: ListTasksInput =
            serde_json::from_value(serde_json::json!({ "status": "Done" })).unwrap();
        assert!(input.query.is_none());
        assert!(input.filters.is_none());
        assert_eq!(input.status.as_deref(), Some("Done"));
    }

    #[test]
    fn list_tasks_status_filtering() {
        fn mcp_task(title: &str, status: &str) -> McpTask {
            McpTask {
                title: title.into(),
                file_path: format!("{}.md", title),
                status: status.into(),
                tags: vec![],
            }
        }

        let tasks = vec![
            mcp_task("Task A", "Todo"),
            mcp_task("Task B", "Doing"),
            mcp_task("Task C", "Done"),
            mcp_task("Task D", "Todo"),
        ];

        let status = Some("Todo".to_string());
        let filtered: Vec<McpTask> = tasks
            .into_iter()
            .filter(|t| status.as_ref().is_none_or(|s| t.status == *s))
            .collect();
        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().all(|t| t.status == "Todo"));
    }

    // -- list_tasks pagination -------------------------------------------------

    fn tasks_n(n: usize) -> Vec<McpTask> {
        (0..n)
            .map(|i| McpTask {
                title: format!("task-{i:03}"),
                file_path: format!("task-{i:03}.md"),
                status: "Todo".to_string(),
                tags: vec![],
            })
            .collect()
    }

    #[test]
    fn resolve_limit_defaults_and_clamps() {
        assert_eq!(resolve_limit(None), DEFAULT_LIST_TASKS_LIMIT);
        assert_eq!(resolve_limit(Some(0)), 1);
        assert_eq!(resolve_limit(Some(37)), 37);
        assert_eq!(resolve_limit(Some(100_000)), MAX_LIST_TASKS_LIMIT);
    }

    #[test]
    fn paginate_first_page_has_more() {
        let out = paginate(tasks_n(100), 0, 50);
        assert_eq!(out.tasks.len(), 50);
        assert_eq!(out.tasks[0].title, "task-000");
        assert!(out.has_more);
    }

    #[test]
    fn paginate_exact_boundary_has_no_more() {
        let out = paginate(tasks_n(100), 50, 50);
        assert_eq!(out.tasks.len(), 50);
        assert_eq!(out.tasks[0].title, "task-050");
        assert!(!out.has_more);
    }

    #[test]
    fn paginate_offset_past_end_is_empty() {
        let out = paginate(tasks_n(10), 500, 50);
        assert!(out.tasks.is_empty());
        assert!(!out.has_more);
    }

    #[test]
    fn paginate_limit_exceeds_total_returns_all() {
        let out = paginate(tasks_n(10), 0, 50);
        assert_eq!(out.tasks.len(), 10);
        assert!(!out.has_more);
    }

    #[test]
    fn list_tasks_input_deserializes_pagination_fields() {
        let input: ListTasksInput =
            serde_json::from_value(serde_json::json!({ "limit": 25, "offset": 50 })).unwrap();
        assert_eq!(input.limit, Some(25));
        assert_eq!(input.offset, Some(50));
        let empty: ListTasksInput = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(empty.limit.is_none());
        assert!(empty.offset.is_none());
    }

    // -- ListTagsInput ---------------------------------------------------------

    #[test]
    fn list_tags_input_deserializes_empty_object() {
        let input: ListTagsInput =
            serde_json::from_value(serde_json::json!({})).unwrap();
        let _ = input;
    }

    #[test]
    fn list_tags_output_serializes_tags_array() {
        let output = ListTagsOutput {
            tags: vec![
                McpTagEntry { name: "bug".to_string() },
                McpTagEntry { name: "feature".to_string() },
            ],
        };
        let json = serde_json::to_value(&output).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "tags": [
                    { "name": "bug" },
                    { "name": "feature" },
                ]
            })
        );
    }

    // -- CreateTaskInput -------------------------------------------------------

    #[test]
    fn create_task_input_deserializes_full_payload() {
        let json = serde_json::json!({
            "title": "My New Task",
            "status": "Doing",
            "tags": ["bug", "feature"],
            "body": "Some description",
        });
        let input: CreateTaskInput = serde_json::from_value(json).unwrap();
        assert_eq!(input.title, "My New Task");
        assert_eq!(input.status, "Doing");
        assert_eq!(input.tags, Some(vec!["bug".into(), "feature".into()]));
        assert_eq!(input.body.as_deref(), Some("Some description"));
    }

    #[test]
    fn create_task_input_deserializes_minimal() {
        let json = serde_json::json!({
            "title": "Minimal Task",
            "status": "Todo",
        });
        let input: CreateTaskInput = serde_json::from_value(json).unwrap();
        assert_eq!(input.title, "Minimal Task");
        assert_eq!(input.status, "Todo");
        assert!(input.tags.is_none());
        assert!(input.body.is_none());
    }

    #[test]
    fn create_task_input_accepts_null_optionals() {
        let json = serde_json::json!({
            "title": "With Nulls",
            "status": "Done",
            "tags": null,
            "body": null,
        });
        let input: CreateTaskInput = serde_json::from_value(json).unwrap();
        assert_eq!(input.title, "With Nulls");
        assert_eq!(input.status, "Done");
        assert!(input.tags.is_none());
        assert!(input.body.is_none());
    }

    #[test]
    fn create_task_output_serializes_task() {
        let output = CreateTaskOutput {
            task: McpTask {
                title: "Created Task".into(),
                file_path: "/workspace/Created Task.md".into(),
                status: "Todo".into(),
                tags: vec!["tag1".into()],
            },
        };
        let json = serde_json::to_value(&output).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "task": {
                    "title": "Created Task",
                    "file_path": "/workspace/Created Task.md",
                    "status": "Todo",
                    "tags": ["tag1"],
                }
            })
        );
    }

    // -- resolve_settings ------------------------------------------------------

    #[test]
    fn resolve_settings_mints_fresh_when_absent() {
        let (s, needs_write) = resolve_settings(None);
        assert!(needs_write, "no parsed value → must persist a fresh entry");
        assert!(!s.enabled, "cold-start default must be opt-in (false)");
        assert_eq!(s.token.len(), GENERATED_TOKEN_LEN);
        assert!(validate_token(&s.token).is_ok());
    }

    #[test]
    fn resolve_settings_returns_as_is_when_token_valid() {
        let input = McpSettings {
            enabled: true,
            token: "x".repeat(MIN_TOKEN_LEN),
        };
        let (s, needs_write) = resolve_settings(Some(input.clone()));
        assert!(!needs_write, "valid persisted value → no rewrite");
        assert_eq!(s, input);
    }

    #[test]
    fn resolve_settings_rotates_short_token_preserving_enabled_true() {
        let input = McpSettings {
            enabled: true,
            token: "short".to_string(),
        };
        let (s, needs_write) = resolve_settings(Some(input));
        assert!(needs_write, "invalid token → must persist the rotation");
        assert!(
            s.enabled,
            "user's `enabled=true` choice must survive token rotation"
        );
        assert_eq!(s.token.len(), GENERATED_TOKEN_LEN);
        assert!(validate_token(&s.token).is_ok());
    }

    #[test]
    fn resolve_settings_rotates_short_token_with_enabled_false() {
        let input = McpSettings {
            enabled: false,
            token: "".to_string(),
        };
        let (s, needs_write) = resolve_settings(Some(input));
        assert!(needs_write);
        assert!(!s.enabled);
        assert!(validate_token(&s.token).is_ok());
    }

    // -- Settings store key preservation (Task 2.10) ---------------------------

    #[test]
    fn mcp_settings_wire_shape_is_exactly_two_keys() {
        // `save_settings` performs `store.set("mcp", to_value(settings))` +
        // `store.save()`. `tauri_plugin_store::Store::set` is per-key, so
        // the only way our code could clobber sibling top-level keys
        // (`workspace_history`, `workspaces`) is if McpSettings serialized
        // to something other than the documented `{enabled, token}` shape.
        // This test pins that wire shape so a future field addition can't
        // silently leak extra keys into the top-level namespace of
        // `settings.json`.
        use std::collections::BTreeSet;
        let value = serde_json::to_value(&McpSettings {
            enabled: true,
            token: "x".repeat(MIN_TOKEN_LEN),
        })
        .unwrap();
        let obj = value
            .as_object()
            .expect("McpSettings must serialize to a JSON object");
        let keys: BTreeSet<&str> = obj.keys().map(String::as_str).collect();
        let expected: BTreeSet<&str> = ["enabled", "token"].into_iter().collect();
        assert_eq!(keys, expected);
    }

    #[test]
    fn writing_mcp_top_level_key_does_not_disturb_siblings() {
        // End-to-end at the JSON level: simulate a `settings.json` already
        // holding `workspace_history` and `workspaces`, then apply the
        // exact mutation `save_settings` performs against the top-level
        // map. Asserts the siblings come out byte-identical.
        let mut store: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        store.insert(
            "workspace_history".to_string(),
            serde_json::json!(["/Users/alice/a", "/Users/alice/b"]),
        );
        store.insert(
            "workspaces".to_string(),
            serde_json::json!({
                "/Users/alice/a": { "filters": [{"operator": "is_empty"}] }
            }),
        );

        let settings = McpSettings {
            enabled: true,
            token: "x".repeat(MIN_TOKEN_LEN),
        };
        store.insert(
            STORE_KEY.to_string(),
            serde_json::to_value(&settings).unwrap(),
        );

        assert_eq!(
            store.get("workspace_history"),
            Some(&serde_json::json!(["/Users/alice/a", "/Users/alice/b"])),
        );
        assert_eq!(
            store.get("workspaces"),
            Some(&serde_json::json!({
                "/Users/alice/a": { "filters": [{"operator": "is_empty"}] }
            })),
        );
        assert_eq!(
            store.get("mcp").and_then(|v| v.get("enabled")),
            Some(&serde_json::json!(true)),
        );
    }

    // -- Middleware: auth_layer (Task 5.6) -------------------------------------

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    fn build_auth_router(stored_token: &str) -> axum::Router {
        use axum::routing::get;
        let stored = Arc::new(RwLock::new(stored_token.to_string()));
        axum::Router::new()
            .route("/probe", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(stored, auth_layer))
    }

    fn auth_request(authz: Option<&str>) -> axum::http::Request<Body> {
        let mut b = axum::http::Request::builder().method("GET").uri("/probe");
        if let Some(h) = authz {
            b = b.header("Authorization", h);
        }
        b.body(Body::empty()).unwrap()
    }

    #[test]
    fn auth_layer_accepts_matching_bearer() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(Some("Bearer validtoken1234")))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::OK);
    }

    #[test]
    fn auth_layer_rejects_token_mismatch() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(Some("Bearer wrongtoken1234")))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_layer_rejects_missing_header() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(None))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_layer_rejects_lowercase_bearer_scheme() {
        // Strict scheme matching: only `Bearer` (case-sensitive) per our
        // `strip_prefix("Bearer ")`. RFC 6750 allows case-insensitive
        // schemes but Cork has no need to be lenient here — every MCP
        // client config we generate writes `Bearer` exactly.
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(Some("bearer validtoken1234")))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_layer_rejects_extra_whitespace_after_scheme() {
        // `Bearer  X` (two spaces) — `strip_prefix("Bearer ")` consumes only
        // one and the remaining " X" doesn't match the stored token.
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(Some("Bearer  validtoken1234")))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_layer_unauthorized_includes_www_authenticate_bearer() {
        use tower::ServiceExt;
        let response = rt().block_on(async {
            build_auth_router("validtoken1234")
                .oneshot(auth_request(None))
                .await
                .unwrap()
        });
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::WWW_AUTHENTICATE)
                .and_then(|v| v.to_str().ok()),
            Some("Bearer"),
        );
    }

    // -- Middleware: workspace_layer (Task 5.6) --------------------------------

    fn build_workspace_router() -> axum::Router {
        use axum::routing::get;
        axum::Router::new()
            .route("/probe", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn(workspace_layer))
    }

    fn workspace_request(header: Option<&str>) -> axum::http::Request<Body> {
        let mut b = axum::http::Request::builder().method("GET").uri("/probe");
        if let Some(h) = header {
            b = b.header("X-Cork-Workspace", h);
        }
        b.body(Body::empty()).unwrap()
    }

    #[test]
    fn workspace_layer_accepts_existing_directory() {
        use tower::ServiceExt;
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        let status = rt().block_on(async {
            build_workspace_router()
                .oneshot(workspace_request(Some(&path)))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::OK);
    }

    #[test]
    fn workspace_layer_rejects_missing_header() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_workspace_router()
                .oneshot(workspace_request(None))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn workspace_layer_rejects_empty_header_value() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_workspace_router()
                .oneshot(workspace_request(Some("")))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn workspace_layer_rejects_nonexistent_path() {
        use tower::ServiceExt;
        let status = rt().block_on(async {
            build_workspace_router()
                .oneshot(workspace_request(Some(
                    "/this/path/does/not/exist/cork-test-9b3c1a",
                )))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn workspace_layer_rejects_file_path_not_directory() {
        use tower::ServiceExt;
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_string_lossy().to_string();
        let status = rt().block_on(async {
            build_workspace_router()
                .oneshot(workspace_request(Some(&path)))
                .await
                .unwrap()
                .status()
        });
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}
