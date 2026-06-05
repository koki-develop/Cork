# Design: 外部ファイル変更の自動検出とリアルタイムUI反映

## アーキテクチャ

```
[Markdown files on disk]
        │
        ▼ (tauri-plugin-fs watch feature: notify crate)
[@tauri-apps/plugin-fs watch() API]
        │
        ├── 変更検知 → フロントエンドのコールバック発火
        │
        ▼
[App.tsx] loadTasks() を呼び出し、invoke("list_tasks") で全ファイル再読み込み
        │
        ▼
[Board.tsx] → [Column.tsx] → [Card.tsx] が新しいタスク一覧で再レンダリング
```

## データフロー

1. **ディレクトリ選択時**: `select_directory()` が以下を実行
   - 選択されたパスを `AppState.selected_dir` に保存
   - `FsExt::allow_directory()` で fs プラグインのスコープに追加
   - フロントエンドにパスを返す
2. **ディレクトリ選択後**: `App.tsx` の `useEffect` 内で:
   - `loadTasks()` でタスク一覧を初回読み込み（`list_tasks` コマンドは state からディレクトリを取得）
   - `watch(dir, callback, { recursive: false, delayMs: 300 })` で監視開始
3. **変更検知時**: コールバック内で `.md` ファイルの変更のみフィルタリング → `loadTasks()`
4. **ステータス変更時**: `update_task_status` コマンド内でパスが選択ディレクトリ配下かを検証

## 採用したアプローチ

`tauri-plugin-fs` の `watch` 機能（フロントエンド駆動）

**理由:**

- Tauri v2 公式プラグイン、内部で `notify` クレートを利用
- クロスプラットフォーム対応（macOS: FSEvents, Linux: inotify, Windows: ReadDirectoryChanges）
- debounce 機能が組み込まれている（`delayMs` オプション）
- スコープ機構によりファイルアクセスを保護

**セキュリティ改善（既存コマンドの retrofitting）:**

- `select_directory` で選択パスを Rust state に保存 + `FsExt::allow_directory()` で fs スコープに登録
- `list_tasks` は引数でパスを受け取らず、Rust state から読み取る
- `update_task_status` は受け取ったパスが選択ディレクトリ配下かを検証し、違反時は `Access denied` を返す

## 変更箇所

### 依存関係の追加

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-fs = { version = "2", features = ["watch"] }
```

```json
// package.json
"@tauri-apps/plugin-fs": "^2"
```

### Rust: プラグイン登録 + AppState 管理

```rust
// src-tauri/src/lib.rs
struct AppState {
    selected_dir: Mutex<Option<String>>,
}

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState { ... })
        .invoke_handler(tauri::generate_handler![...])
        .run(...)
}
```

### Frontend: App.tsx

- `@tauri-apps/plugin-fs` から `watch` をインポート
- ディレクトリ選択後に watcher を開始（`delayMs: 300` で debounce）
- クリーンアップ時に `unwatch()` を呼び出し
- `.md` ファイルの変更のみフィルタリング
- `loadTasks()` は Rust state からディレクトリを読み取るため引数不要

### 権限設定

```json
// src-tauri/capabilities/default.json
{
  "permissions": ["core:default", "opener:default", "fs:default"]
}
```

## 注意点

- `watch` のデフォルトは非リカーシブ（サブディレクトリは監視しない）
- `delayMs: 300` で atomic save 等の連続イベントを集約
- `useEffect` のクリーンアップ関数で `unwatch()` を呼び出し、メモリリークを防止
