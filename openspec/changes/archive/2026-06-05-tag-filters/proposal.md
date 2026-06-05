## Why

Cork のタスクはすでに frontmatter の `tags: [string, ...]` で多軸の分類を持てるが、ボード上でタグを使って一覧を絞り込む手段が無い。タイトル検索 (`search-tasks`) はあるが、これは「bug かつ p0」「frontend を除く」のような属性ベースの絞り込みを表現できない。タスクが増えるほどタグの価値は「貼れる」ことより「絞れる」ことに移るため、`task-tags` を実用的に機能させるにはフィルタ機能が前提となる。

スコープを軽く保つため、AND の平坦な組み合わせのみ・タグフィールドのみを対象とする (`status` / `title` などのフィルタ化は別 change で扱える土台だけ残す)。

## What Changes

- Rust バックエンド: `list_tasks` Tauri コマンドに `filters: Option<Vec<TagFilterDto>>` パラメータを追加する。各フィルタは `operator: TagFilterOperator` と `tags: Vec<String>` を持つ。バックエンドは既存の `query` フィルタとの AND として評価し、マッチしたタスクのみ返す。
- Rust バックエンド: 既存のタスクキャッシュ (`AppState::tasks_cache`) に対して in-memory でフィルタを評価する (ファイル I/O ゼロ)。
- フロントエンド API: `src/api/tasks.ts` の `listTasks()` シグネチャを `(query?, filters?) => Promise<Task[]>` に拡張する。
- フロントエンド hook: `useWorkspace` に `filters: TagFilter[]` ステートと `handleFiltersChange` ハンドラを追加し、`query` と同様に変更即時 `listTasks` を呼ぶ。
- 永続化: 既存の Cork 流儀 (`workspace.rs` の `get/set_workspace_directory` パターン) に倣い、**Rust 側の Tauri command が `tauri-plugin-store` をラップ**する。新規コマンド `get_workspace_filters(workspace_dir)` / `set_workspace_filters(workspace_dir, filters)` を追加し、frontend は invoke 経由でアクセスする。保存先は既存の `settings.json` 内の `filters` キー配下に `{ [workspaceDir]: StoredFilter[] }` の形で書く (workspace_dir と同居)。`.cork.json` には書かない (個人設定の位置付け)。
- UI: 既存のツールバー (`SearchBar` のある行) に `FilterButton` を追加し、クリックでフィルタ popover を開く。popover は Filter 一覧 + Add filter + Clear all を提供する。
- UI: フィルタ適用中で結果 0 件のとき、ボードの代わりに empty state を表示し、ユーザに「Clear all」「Edit filters」を提示する。
- 操作: SearchBar 既存の `Cmd/Ctrl+F` に加えて、`Cmd/Ctrl+Shift+F` で Filter popover を開くショートカットを追加する。

## Capabilities

### New Capabilities

- `tag-filters`: タグを使ったタスク絞り込み機能。`list_tasks` コマンドに `filters` パラメータを追加し、6 種のオペレータ (`contains` / `not_contains` / `contains_any` / `contains_all` / `is_empty` / `is_not_empty`) を全体 AND で評価する。フロントエンドは toolbar 上の Filter popover でフィルタ追加・編集・削除を行い、ワークスペース毎にローカル永続化する。既存のタイトル検索 (`query`) と AND で組み合わさる。

### Modified Capabilities

- `search-tasks`: `list_tasks` コマンドの仕様に `filters` パラメータを追加し、`query` と `filters` の両方が指定された場合は AND で結合される旨を追記する。既存の query のみのシナリオは変わらない。

## Impact

- **Rust バックエンド (`src-tauri/`)**:
  - `src-tauri/src/task.rs`: `list_tasks` の引数に `filters: Option<Vec<TagFilterDto>>` を追加。`TagFilterOperator` enum と `TagFilterDto` 構造体を新規定義し、`serde::Deserialize` 派生で frontend ペイロードを受け取る。`query` フィルタリングと同じキャッシュ取得→フィルタ評価のパスに統合する。`list_all_tags` コマンドも `task.rs` に新規追加。
  - `src-tauri/src/workspace.rs`: フィルタ永続化のため `get_workspace_filters(workspace_dir: String)` / `set_workspace_filters(workspace_dir: String, filters: Vec<StoredFilter>)` の 2 コマンドを新規追加。既存の `settings.json` ストアの `filters` キー (`Map<workspace_path, Vec<StoredFilter>>`) を読み書きする。
  - `src-tauri/Cargo.toml`: 依存追加なし (既存の `serde` / `nucleo-matcher` / `tauri-plugin-store` で十分)。
- **フロントエンド API (`src/api/tasks.ts`)**: `listTasks` シグネチャを `(query?: string, filters?: TagFilter[]) => Promise<Task[]>` に拡張。両方 `undefined` のとき従来通り引数なしで invoke する。
- **フロントエンド型 (`src/types/`)**:
  - 新規 `src/types/filter.ts` — `TagFilter` / `TagFilterOperator` / `TAG_FILTER_OPERATORS` を export。`src/types/index.ts` から re-export。
- **フロントエンド hook (`src/hooks/useWorkspace.ts`)**: `filters` ステートを追加し、`query` と同様に変更時即時 `listTasks(query, filters)` を呼ぶ。ファイル監視リロードや CRUD 後の `loadTasks` も同じ filters を渡す。
- **フロントエンド hook (新規)**: `src/hooks/useFilterStore.ts` — 上記 2 つの Tauri コマンドをワークスペース単位で呼び出し、フィルタの読み書きと書き込み debounce を担う。`useWorkspace` がこれを利用する。
- **コンポーネント** (atomic design):
  - `src/components/molecules/TagEditor.tsx` (変更) — `suggestions?: string[]` / `maxTags?: number` プロップを新規追加。autocomplete suggestion popover を内部実装する。既存挙動は影響なし (両プロップとも省略で従来通り)。
  - `src/components/molecules/TagOperandInput.tsx` (新規) — `mode: "single" | "multi" | "none"` に応じて `TagEditor` を `maxTags` 付きで薄くラップする。none モードでは何も描画しない。
  - `src/components/molecules/FilterRow.tsx` (新規) — 1 フィルタ行 (Operator Select + TagOperandInput + Remove ボタン)。
  - `src/components/molecules/FilterButton.tsx` (新規) — toolbar 上のトリガー (count badge 内包)。
  - `src/components/organisms/shell/TagFilterPopover.tsx` (新規) — popover 全体。state を内部で管理し `onChange(filters)` を吐く。`Modal` と同じ `shell/` ドメイン。
  - `src/components/pages/BoardPage.tsx` (変更) — toolbar 列に `FilterButton` + `TagFilterPopover` を配置し、`useWorkspace` の `filters` / `handleFiltersChange` と配線。フィルタ適用中 0 件の empty state も担当。
- **API ラッパー (`src/api/workspace.ts`)**: 既存ファイル。`getWorkspaceFilters(workspaceDir)` / `setWorkspaceFilters(workspaceDir, filters)` を追加 (workspace 関連 API として同居)。
- **Tauri capability**: 既存の `store:default` で読み書きは賄える。`capabilities/default.json` の変更不要。
- **データ移行**: 不要。フィルタは新規追加機能で、既存タスクファイルや `.cork.json` に手を入れない。
- **テスト (Rust)**: `task.rs` の既存 `#[cfg(test)] mod tests` に各オペレータの判定ヘルパー (`matches_filter`) のユニットテストを追加。`#[tauri::command]` 本体は従来通り未テスト。
- **依存関係**: 追加無し。Cargo / package.json に変更なし (`tauri-plugin-store` は既に依存済み)。
