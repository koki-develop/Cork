# Design: 設定画面の実装と作業ディレクトリの永続化

## アーキテクチャ

### 永続化の仕組み

`tauri-plugin-store` を使用して選択ディレクトリを永続化する。このプラグインはアプリのデータディレクトリに JSON ファイルとしてキーバリューストアを保存する。

```
[App startup]
    │
    ▼
[invoke("get_workspace_directory")]  ← Rust: AppState と Store からパスを取得
    │
    ├── null → [DirectoryPicker]
    │
    └── path → [Board + settings gear]
```

### データフロー

1. **アプリ起動時**: `App.tsx` の `useEffect` で `invoke("get_workspace_directory")` を呼び出す
   - Rust 側: `AppState.workspace_dir` を確認。`None` の場合、Store から読み込んで `AppState` に設定、その値を返す。Store にもなければ `null` を返す
   - フロントエンド: `null` なら `DirectoryPicker`、パスがあれば Board を表示
2. **ディレクトリ選択時**: `select_directory()` が以下を実行
   - ダイアログで選択されたパスを `AppState.workspace_dir` に保存
   - Store にも保存（永続化、キーは `"workspace_dir"`）
   - `FsExt::allow_directory()` で fs スコープに追加
3. **設定画面でのディレクトリ変更時**: 同じ `select_directory()` を呼び出し、変更後のパスで Board を再初期化
4. **保存されたディレクトリが無効な場合**: 次回起動時に Store から読み込むが、ディレクトリが存在しない場合 `null` を返し、`DirectoryPicker` を表示

## 採用するアプローチ

### 永続化: `tauri-plugin-store`

**理由:**

- Tauri v2 公式プラグイン
- アプリデータディレクトリに自動保存、手動セーブも可能
- Rust と JS の両方からアクセス可能
- キーバリュー形式でシンプル

### 設定画面 UI: モーダルオーバーレイ

- Board のヘッダー領域（左上）に設定アイコン（歯車）を配置
- クリックでモーダルが開く
- 現在のディレクトリパスを表示
- 「ディレクトリを変更」ボタン → `invoke("select_directory")` を呼び出し
- ディレクトリ変更後はモーダルを閉じ、Board を再読み込み

## 変更箇所

### 依存関係の追加

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-store = "2"
```

### Rust: プラグイン登録 + コマンド追加

```rust
// src-tauri/src/lib.rs

struct AppState {
    workspace_dir: Mutex<Option<String>>,
}

// 新しいコマンド:
// - get_workspace_directory() → Option<String>
//   - AppState.workspace_dir に値があればそれを返す
//   - なければ Store からキー "workspace_dir" を読み込んで AppState に設定して返す
//   - Store にもなければ None を返す

// select_directory() を修正:
// - Store にもキー "workspace_dir" でパスを保存する処理を追加

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            workspace_dir: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            select_directory,
            list_tasks,
            update_task_status,
            get_workspace_directory,  // 新規
        ])
        .run(...)
}
```

### Frontend: 新しいコンポーネント + App.tsx の修正

#### App.tsx

- 起動時に `invoke("get_workspace_directory")` を呼び出し、初期 `dir` を設定
- `dir` が null の場合 → `DirectoryPicker`
- `dir` が設定済みの場合 → `Board`（`currentDir` と `onDirectoryChange` を props で渡す）
- `invoke` に `.catch()` をチェーンし、エラー時はコンソールに出力する

#### SettingsPanel.tsx (新規)

- 現在のディレクトリパスを表示
- 「ディレクトリを変更」ボタン
- 閉じるボタン

#### Board.tsx

- `lucide-react` の `Settings` アイコンを使用した設定ボタンを右上に追加
- `SettingsPanel` の開閉状態を管理（`settingsOpen` state）
- ディレクトリ変更時に `onDirectoryChange` を呼び出す

### 権限設定

```json
// src-tauri/capabilities/default.json
{
  "permissions": ["core:default", "opener:default", "fs:default", "fs:allow-watch", "store:default"]
}
```

## 注意点

- Store の初期化はアプリ起動時に行われるため、コマンドから即座に読み書き可能
- 永続化されたパスが存在しないディレクトリを指す場合のハンドリング
- ディレクトリ変更時はファイル監視の再設定が必要（一旦 unwatch → 新しいパスで watch）
- `tsc` の `noUnusedLocals` / `noUnusedParameters` が有効なので、使用しない変数は適切に削除する
