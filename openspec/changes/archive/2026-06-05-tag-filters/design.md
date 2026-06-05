## Context

Cork は frontmatter ベースの Markdown Kanban で、`task-tags` (archived 2026-06-05) によりタスクが任意の文字列タグを持てるようになった。`search-tasks` (archived 2026-06-05) によりタイトルの fuzzy 検索もできる。しかし「タグで絞り込む」UI が無いため、タグは付与できても活用できない状態。本 change はこのギャップを埋める。

現状の関連実装:

- `list_tasks` (`src-tauri/src/task.rs:58`): `query: Option<String>` を取り、空でないとき `AppState::tasks_cache` に対して `nucleo_matcher` でタイトル fuzzy matching。query なしのときはファイル読み込み + キャッシュ更新。
- `AppState` (`src-tauri/src/state.rs`): `Mutex<Option<PathBuf>>` (workspace) と `Mutex<Option<Vec<Task>>>` (tasks_cache) を持つ。`set_workspace()` でキャッシュもクリアする。
- `Task` 型 (`src-tauri/src/task.rs:13`): `tags: Vec<String>` をすでに保持。
- `useWorkspace` (`src/hooks/useWorkspace.ts`): `query` ステートと `handleQueryChange` で `listTasks(q)` を即時呼ぶ。`queryRef` でファイル監視からの reload にも query を渡す。
- ツールバー: `BoardPage` 内 `<BoardLayout toolbar={...}>` スロットに SearchBar 単独で配置。
- 永続化基盤: `tauri-plugin-store` capability `store:default` 付与済み。現状の利用は `workspace.rs` の workspace dir 保存のみ。

## Goals / Non-Goals

**Goals:**

- `list_tasks` に `filters: Option<Vec<TagFilterDto>>` を追加し、6 種オペレータを全体 AND で評価して絞り込まれたタスク一覧を返す
- 既存の `query` フィルタとの AND 結合を保証する (query と filters が同時指定されたとき両条件を満たすタスクのみ返す)
- フィルタ評価はキャッシュに対して in-memory で行い、ファイル I/O を発生させない (既存 query と同じ路線)
- フロントエンドは toolbar 上の Filter popover でフィルタ列を編集し、変更時は即時 `listTasks` を呼ぶ (debounce なし)
- ワークスペース毎にフィルタをローカル永続化し、ワークスペースを開き直したとき前回のフィルタを復元する
- 既存の SearchBar / `query` 動作・全タスク返却動作には影響を与えない

**Non-Goals:**

- OR ロジック / ネストされたグループ / `NOT(group)` のようなブール式は対象外。本 change は flat AND のみ
- タイトル・ステータス・本文に対するフィルタオペレータは対象外。Field は "Tags" 固定。将来拡張のための余地 (UI 上の "Field" カラム) は残すが、別 change で実装
- スコア順ソート / ハイライト表示は対象外
- `.cork.json` への保存 (チーム共有) は対象外。フィルタは個人設定
- 永続化のクラウド同期 / リモートワークスペース対応は対象外

## Decisions

### バックエンド API: `list_tasks` に `filters` パラメータを追加 (新規コマンドにしない)

| アプローチ                                        | 判断                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_tasks(query, filters)` に統合               | **採用**。既存 `query` と同じく「キャッシュに対するフィルタ評価」のため、ファイル読み込みパス / キャッシュ更新パスを共有できる。フロントエンドの reload 呼び出しも 1 つの `loadTasks` に集約できる。 |
| 新コマンド `filter_tasks(filters)` を追加         | 不採用。`query` との AND を成立させるには結局 `list_tasks` 側でも filters を受けるか、フロントエンドで 2 段階呼び出しになる。前者は API 重複、後者は IPC 増加。                                      |
| フロントエンドで `tasks` ステートをフィルタリング | 不採用。タスク数が増えたとき毎フレームでの再評価が無駄。Rust 側ですでにキャッシュとマッチャを持っているのでそちらで完結させる方が一貫する。`is_empty` / `is_not_empty` 系も同じ場所で評価可能。      |

具体シグネチャ:

```rust
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TagFilterOperator {
    Contains,
    NotContains,
    ContainsAny,
    ContainsAll,
    IsEmpty,
    IsNotEmpty,
}

#[derive(Deserialize)]
pub struct TagFilterDto {
    pub operator: TagFilterOperator,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn list_tasks(
    query: Option<String>,
    filters: Option<Vec<TagFilterDto>>,
    state: tauri::State<'_, AppState>,
) -> Vec<Task> { ... }
```

評価順序: `cache → query (fuzzy) → filters (AND)`。query が空のときは全件、filters が空 (`None` or `Some(vec![])`) のときも全件を維持。

### フィルタ評価ヘルパー (Rust)

`task.rs` 内に `fn matches_filter(task: &Task, filter: &TagFilterDto) -> bool` を private で実装。判定ロジックは以下の表に従う。**全 operator で「`filter.tags` が空 = フィルタ無効化 (true を返してフィルタを実質スキップ)」** に統一する。これにより UI で operand 未入力中の行が結果に影響せず、編集中フィードバックが自然になる:

| Operator      | `filter.tags` が空      | `filter.tags` が非空                                  |
| ------------- | ----------------------- | ----------------------------------------------------- |
| `Contains`    | true (skip)             | `task.tags.contains(&filter.tags[0])`                 |
| `NotContains` | true (skip)             | `!task.tags.contains(&filter.tags[0])`                |
| `ContainsAny` | true (skip)             | `filter.tags.iter().any(\|x\| task.tags.contains(x))` |
| `ContainsAll` | true (skip)             | `filter.tags.iter().all(\|x\| task.tags.contains(x))` |
| `IsEmpty`     | `task.tags.is_empty()`  | `task.tags.is_empty()` (`filter.tags` は無視)         |
| `IsNotEmpty`  | `!task.tags.is_empty()` | `!task.tags.is_empty()` (`filter.tags` は無視)        |

タグ比較は完全一致 (大文字小文字区別あり)。タグの正規化は `task-tags` capability の責任なので本 change ではしない。

### 全タグ抽出コマンド: `list_all_tags`

`TagOperandInput` の autocomplete に「ワークスペース内に実在するタグの集合」が必要だが、frontend の `tasks` ステートはフィルタ適用後の絞り込み結果なので、そこから派生させると **フィルタ済み状態ではタグ候補が消える** という致命的バグになる。Rust 側はキャッシュに「全タスク」を持っているのでそこから派生させる方が一貫する。

新規コマンド `list_all_tags() -> Vec<String>` を `task.rs` に追加 (`tauri::command`):

- `state.get_cached_tasks()` から全タスクの `tags` を `HashSet<String>` で重複排除
- **アルファベット順 (case-insensitive) でソート** して `Vec<String>` で返す。順序を固定することで autocomplete 候補が毎回シャッフルされず、ユーザの記憶に基づく操作 (上から N 番目を選ぶ等) が安定する
- キャッシュ未構築 (`None`) のときは `read_all_tasks` を実行してキャッシュを埋めてから抽出
- ワークスペース未設定 (`state.workspace().is_none()`) のときは空 `Vec` を返す (エラーにしない)

frontend (`useWorkspace`) は以下のタイミングでこれを呼んで `availableTags` ステートを更新:

1. ワークスペース切替時
2. タスク CRUD (`createTask` / `updateTask` / `deleteTask`) の完了後
3. **ファイル監視 (`watch`) の reload 時** (外部エディタで新タグが追加されたケースに追従)

呼び出し順序は「`listTasks` (キャッシュ更新も兼ねる) → `listAllTags` (更新後キャッシュから抽出)」とする。

### `Contains` と `ContainsAny[1 要素]` は同じ判定ロジックを共有する

`Contains(['bug'])` と `ContainsAny(['bug'])` は意味的に等価。UI / data model レベルでは「単一タグ用」「複数タグ用」として明確に分けるが、Rust 実装では `Contains` を `ContainsAny` の 1 要素ケースとして同じヘルパー (`tags_contains_any`) に委譲し、`NotContains` も同様に `ContainsAny` の否定として実装する。コード重複と評価バグの両方を避ける。spec で見える振る舞いは表通り (UI からも区別できる) なので影響なし。

### フロントエンド: 型と API 定義

`src/types/filter.ts` (新規):

```ts
export const TAG_FILTER_OPERATORS = [
  "contains",
  "not_contains",
  "contains_any",
  "contains_all",
  "is_empty",
  "is_not_empty",
] as const;
export type TagFilterOperator = (typeof TAG_FILTER_OPERATORS)[number];

export type TagFilter = {
  id: string; // クライアント側のキー (順序保持 / React key 用)
  operator: TagFilterOperator;
  tags: string[]; // is_empty/is_not_empty では []
};
```

`src/api/tasks.ts`:

```ts
type TagFilterPayload = { operator: TagFilterOperator; tags: string[] };

export const listTasks = (query?: string, filters?: TagFilter[]) => {
  const payload: { query?: string; filters?: TagFilterPayload[] } = {};
  if (query) payload.query = query;
  if (filters && filters.length > 0) {
    payload.filters = filters.map((f) => ({
      operator: f.operator,
      tags: f.tags,
    }));
  }
  return invoke<Task[]>("list_tasks", payload);
};
```

`id` フィールドは IPC 越境しない (Rust 側は順序のみ意識すれば良い)。

### `useWorkspace` の filters 統合

`query` と同じく `filters` ステートを `useState<TagFilter[]>([])` で保持。`queryRef` と同じ `filtersRef` を用意し、`loadTasks` 内部で `listTasks(queryRef.current || undefined, filtersRef.current.length > 0 ? filtersRef.current : undefined)` を呼ぶ。

新規ハンドラ `handleFiltersChange(next: TagFilter[])`:

1. `setFilters(next)`
2. 永続化 (debounce 500ms 程度) を `useFilterStore` に依頼
3. `loadTasks` を即時呼ぶ (キーストロークごとの呼び出しは TagOperandInput 内で抑制されるため、ここで debounce 不要)

`queryIdRef` 同様の race condition 防止カウンタは filters 変更 + query 変更を統合した形に変更する (`requestIdRef`)。

### 永続化: Rust 側コマンドで `tauri-plugin-store` を wrap する (既存 Cork パターン踏襲)

Cork の既存パターン (`workspace.rs` の `set/get_workspace_directory`) と同様、**frontend は `@tauri-apps/plugin-store` を直接使わず、Rust 側の Tauri command 経由で store にアクセスする**。`@tauri-apps/plugin-store` を frontend deps に新規追加しない理由は (1) 既存依存と一貫させる (2) ストアスキーマを Rust 側に閉じ込めて変更を局所化する (3) capability も既存の `store:default` だけで賄える。

ストアファイル: 既存の `settings.json` を流用 (workspace_dir と同居)。データ構造:

```json
{
  "workspace_dir": "/Users/koki/work/cork-board",
  "filters": {
    "/Users/koki/work/cork-board": [
      { "operator": "contains", "tags": ["bug"] },
      { "operator": "is_not_empty", "tags": [] }
    ],
    "/Users/koki/work/other-board": [{ "operator": "contains_any", "tags": ["a", "b"] }]
  }
}
```

新規 Tauri command (実装は `src-tauri/src/workspace.rs` に追加。フィルタ永続化はワークスペースの個人設定的な性質なので workspace ドメインに同居させる):

```rust
#[derive(Serialize, Deserialize)]
pub struct StoredFilter {
    pub operator: TagFilterOperator,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn get_workspace_filters(
    workspace_dir: String,
    app: tauri::AppHandle,
) -> CmdResult<Vec<StoredFilter>>;

#[tauri::command]
pub fn set_workspace_filters(
    workspace_dir: String,
    filters: Vec<StoredFilter>,
    app: tauri::AppHandle,
) -> CmdResult<()>;
```

両コマンドとも内部で `app.store("settings.json")` を取り、`filters` キー配下の Map を読み書きする。`workspace_dir` 文字列を Map のキーとして使う (絶対パスはマシン内で一意)。`set_*` 時に空配列が渡されたら該当キーを削除し、Map 自体が空になったら `filters` キー自体も削除する (ノイズ削減)。

frontend API (`src/api/workspace.ts` に追加):

```ts
export const getWorkspaceFilters = (workspaceDir: string) =>
  invoke<StoredFilter[]>("get_workspace_filters", { workspaceDir });
export const setWorkspaceFilters = (workspaceDir: string, filters: StoredFilter[]) =>
  invoke<void>("set_workspace_filters", { workspaceDir, filters });
```

ロード結果は `id` を `crypto.randomUUID()` で補完して `TagFilter[]` 化。`id` は永続化しない (再起動毎に振り直し、`TagFilter.id` は React key と順序保持専用)。

書き込みは `useFilterStore` 内で `500ms` debounce する。書き込み中エラー (権限など) は `console.error` でログを残しサイレントに失敗 (主機能ではないため、トーストを出さない)。

### `useFilterStore` のロード中状態

初回マウントでは `getWorkspaceFilters` 呼び出しを `await` する必要がある。その間 `loadTasks` を走らせると永続化フィルタが効かない一瞬の窓ができるため、`useFilterStore` は次のシェイプで返す:

```ts
type FilterStoreState = { status: "loading" } | { status: "ready"; filters: TagFilter[] };

function useFilterStore(workspaceDir: string | null): {
  state: FilterStoreState;
  scheduleSave: (filters: TagFilter[]) => void;
};
```

`workspaceDir === null` のとき `state = { status: "ready", filters: [] }` を返す (ワークスペース未選択時はフィルタなし)。`workspaceDir` が変わるたびに `status: "loading"` に戻し、`getWorkspaceFilters` の解決で `status: "ready"` に遷移する。`useWorkspace` 側では `state.status === "loading"` の間 `loadTasks` を呼ばないようにし、ロード完了直後の useEffect で 1 度だけ `loadTasks` を発火する。

### ワークスペース切替時の挙動

`useWorkspace` 内の `dir` 変更 useEffect:

1. `useFilterStore(dir)` が自動的に `status: "loading"` に遷移し `getWorkspaceFilters(dir)` を await する
2. `filterStore.state.status === "ready"` を観測した別 useEffect が `setFilters(state.filters)` で適用
3. その useEffect 内で `loadTasks()` (フィルタ適用済み) + `listAllTags()` を順に実行

`status === "loading"` の間は `loadTasks` を呼ばないため、フィルタ未適用の全件結果がボードに一瞬出る現象を防ぐ。ワークスペース切替 = 状態リセット (`tasks`, `availableTags`)。`query` は明示的にリセットせず維持 (現状の挙動を変えない)。タスク作成/更新/削除のキャッシュ無効化フローには手を入れない。

### UI コンポーネント構成

```
shell/
├─ TagFilterPopover.tsx       ← organism, 新規
│   ├─ uses molecules/FilterRow
│   └─ uses atoms/Button (Add filter / Clear all)
molecules/
├─ FilterButton.tsx           ← 新規 (toolbar trigger)
├─ FilterRow.tsx              ← 新規 (1 row)
├─ TagOperandInput.tsx        ← 新規 (薄いラッパ。mode に応じて TagEditor を maxTags 付きで呼ぶ or 何も描画しない)
└─ TagEditor.tsx              ← 既存を拡張: suggestions?: string[] と maxTags?: number を追加
```

`FilterButton` は単体で組み込めるよう、open 状態管理を内包しない (props で `count` と `onClick` を受ける)。`TagFilterPopover` は `isOpen`, `onClose`, `anchorRef`, `filters`, `onFiltersChange`, `availableTags` を取る。

### `TagEditor` を拡張して autocomplete と最大タグ数を取り込む (`TagOperandInput` で再実装しない)

既存 `TagEditor` molecule (`src/components/molecules/TagEditor.tsx`) は Enter / カンマ / Backspace / IME / `flushPending` まで実装済み。`TagOperandInput` の multi モードがこれを丸ごと再実装すると保守箇所が 2 つに増えて発散する。

採用する形:

- `TagEditor` props に **追加 (両方とも省略可)**: `suggestions?: string[]` / `maxTags?: number`
- `suggestions` が指定されたとき: 入力欄フォーカス時に suggestion popover を出す (詳細は下記)
- `maxTags === 1` のとき: タグが 1 個に達したら入力欄を `disabled` にする (DOM 上は残す。フォーカス遷移を保つため非表示にはしない)
- 両プロップとも未指定なら **既存の挙動と完全に同じ** (`task-tags` の TagEditor シナリオはすべてそのまま通る)

`TagOperandInput` は `mode` に応じて以下の薄いラッパになる:

- `mode === "none"` → null を return
- `mode === "single"` → `<TagEditor tags={tags} onChange={onChange} suggestions={availableTags} maxTags={1} />`
- `mode === "multi"` → `<TagEditor tags={tags} onChange={onChange} suggestions={availableTags} />`

これで `TagEditor` のキーボード/IME/flush ロジックを 1 箇所に集約しつつ、フィルタ専用の制約 (single = max 1) を表現できる。

### Suggestion popover の挙動

`TagEditor` 拡張内に内蔵:

- 入力欄 (`<input>`) フォーカス時に popover をアンカー直下に表示
- 候補ソース: `props.suggestions` (必ず外部から渡される全タグリスト)
- 入力中の文字列で **fuzzy filter** (frontend 側、`nucleo-matcher` を呼ぶのではなく `lodash.deburr` 不要の軽量実装で十分: 各候補について「クエリ文字を順序保ったまま subsequence で含むか」を判定)。SearchBar の `nucleo-matcher` と同じ感覚で操作できることを優先
- 各候補に `· N tasks` の件数表示は **本 change では実装しない** (件数を計算するには `tasks` 全件アクセスが必要だが、`TagEditor` は atoms/molecules 層で `@/api` も `@/hooks` も触れないルール。件数を props で渡すと API が肥大化するため、本 change のスコープでは候補テキストのみ)。タスク件数表示は将来の独立 change の検討事項
- 既選択タグ (`tags` に含まれる) は disabled (`text-cork-muted/40 line-through`)、選択不可
- ↑/↓ で選択移動、Enter で確定 (現在の `commitPending` ロジックに統合)、Esc で popover のみ閉じる
- マウスホバーで選択カーソルが移動 (キーボード/マウス両対応)
- popover サイズ: `w-[260px] max-h-[200px]`、`bg-cork-surface border-cork-border/60 rounded-lg shadow-2xl z-50` (TagEditor 自体は popover の中で使われるため、suggestion popover はさらに上の z-50)

`Popover` 自体を `Modal` の派生ではなく独立実装にする (アンカー付きフローティング、サイズが異なる)。`shell/` ドメインに置く。z-index は `Modal` (既存実装は `z-50`) と衝突せず、かつボードカードより前面に来るよう `z-40` を採用する (`Modal` を popover の上に重ねるユースケースは現状ないが、将来 Settings ダイアログを popover の上に出しても自然な順になる)。

### Empty state (フィルタ適用 0 件)

`BoardPage` 内で `tasks.length === 0 && (query !== "" || filters.length > 0)` のとき、`KanbanColumn` の代わりに `EmptyState` を表示する。`EmptyState` は新規 molecule とせず、`BoardPage` のローカル JSX で十分 (再利用性が低い)。

### キーボードショートカット

`SearchBar` の `Cmd/Ctrl+F` ハンドラと同じパターンで、`BoardPage` (もしくは `useFilterPopover` 抽出フック) に `Cmd/Ctrl+Shift+F` リスナーを置く。`isOpen` が `true` のときは Esc でクローズ。

`Cmd/Ctrl+Shift+F` の選定根拠: VSCode / Cursor / GitHub Desktop など開発者ツール系の慣例で「絞り込み (workspace 検索)」に割り当てられているため、Cork のユーザ層 (Markdown / 開発タスク管理) に馴染みがある。Tauri webview ではブラウザレベルの予約 (Linux Chromium の「フォントサイズ拡大」等) は奪われない実装で確認済み。`Cmd/Ctrl+K` 系は将来のコマンドパレット候補として温存する。

`SearchBar` 既存のクリーンアップに倣い、`useEffect` の return で `removeEventListener` する。

### バリデーション / 表示挙動

| 状況                                                                       | 挙動                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| operand 空の `contains` / `not_contains` / `contains_any` / `contains_all` | バックエンドではスキップ (全マッチ)。UI では薄いボーダー + プレースホルダー "Select tag"                                                                                                                                                                                                                                        |
| `contains_any` の operand が 1 個                                          | `contains` と同等に動作するが UI 上は禁止しない                                                                                                                                                                                                                                                                                 |
| 存在しないタグの参照 (タグ削除後)                                          | UI でチップの右に `AlertCircle` (lucide) アイコン (size-3, `text-cork-muted/80`) を出し、`title` 属性で "Tag no longer exists in this workspace" を提示する。色相は cork-\* トークン縛りに従い、警告色は使わない (cork に warning トークンが無いため。専用トークン追加は別 change)。バックエンドは普通に評価 (マッチしないだけ) |
| 同じフィルタを 2 行                                                        | 許可。冗長だが UX 的に編集中の中間状態として自然                                                                                                                                                                                                                                                                                |
| 全部削除                                                                   | popover は閉じず empty state に戻る。Filter ボタンの count badge は消える                                                                                                                                                                                                                                                       |

### データフロー全体

```
[User edits filter in popover]
  ↓
TagFilterPopover → onFiltersChange(next)
  ↓
useWorkspace.handleFiltersChange(next)
  ├─ setFilters(next)
  ├─ filtersRef.current = next
  ├─ filterStore.scheduleSave(next)  // workspaceDir はフック内部でキャプチャ、500ms debounced
  └─ loadTasks() → listTasks(query, next)
                    ↓
                  invoke("list_tasks", { query, filters })
                    ↓
                  Rust: cache → query fuzzy → filters AND
                    ↓
                  Vec<Task>
                    ↓
                  setTasks(result)
                    ↓
                  BoardPage 再描画

[Workspace switch]
  dir 変更 → useFilterStore({status:"loading"}) → getWorkspaceFilters(dir) await
    → useFilterStore({status:"ready", filters: loaded})
    → useWorkspace の useEffect が status=="ready" を観測 → setFilters(loaded) → loadTasks() + listAllTags()
```

## Risks / Trade-offs

| Risk                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| フィルタ + query の組み合わせで結果 0 件になりやすく、ユーザが操作不能 (タスクが「消えた」と感じる) になる                                                                         | 0 件時は専用 empty state を出し、"Clear all filters" / "Edit filters" の明示的なリカバリ動線を用意する。Filter ボタンに件数バッジを出すことでフィルタ適用中であることを常時可視化                                                                               |
| 永続化失敗時にユーザが気づかない                                                                                                                                                   | 主機能ではないため致命傷ではない。ただし `console.error` でログを残す。トースト通知は出さない (ノイズ)                                                                                                                                                          |
| ワークスペースが多数あるとストアが肥大化                                                                                                                                           | `workspaces` オブジェクトのキー総数が一定 (例: 50) を超えたら最後にロードした順に保持し、それより古いものを破棄する LRU を `useFilterStore` 内で実装。本 change のスコープ内では 未実装 (将来検討、Open Questions 参照)                                         |
| `Contains` と `ContainsAny` の重複定義による混乱                                                                                                                                   | UI 上で operator label を明確にする ("contains" は単一、"contains any of" は複数)。バックエンドは `tags_contains_any` ヘルパーで実装を共有 (`Contains` = 1 要素ケース、`NotContains` = 否定) し、6 operator × 各種ケースの単体テストで挙動を担保                |
| `contains_all` の operand 空 = 全マッチ (vacuous truth) はユーザに分かりづらい                                                                                                     | UI で空 operand 行を「無効状態」として薄く表示し、結果に影響しない旨を視覚的に伝える                                                                                                                                                                            |
| Filter popover が SearchBar とフォーカス競合する                                                                                                                                   | popover 内ではフォーカスループ + `Cmd/Ctrl+F` リスナーは SearchBar 側で `e.target` が popover 外であることを確認しない → 影響なし (既存 SearchBar のリスナーは self-focus するだけなので popover を閉じない)。Cmd/Ctrl+Shift+F は popover 内では handled しない |
| `tauri-plugin-store` のファイル書き込みがフィルタ更新ごとに発生し、I/O オーバーヘッド                                                                                              | 500ms debounce で吸収。ファイルサイズは小さい                                                                                                                                                                                                                   |
| frontend で `availableTags` を `tasks` から派生するとフィルタ後の tasks には全タグが含まれない                                                                                     | 新規コマンド `list_all_tags() -> Vec<String>` で対応 (詳細は下記「Decisions: 全タグ抽出コマンド」)。                                                                                                                                                            |
| `Select` molecule が `button` に `value` を直接表示する仕様で、`value` (snake_case) と `label` ("contains any of" 等) を分離する必要がある                                         | `Select.tsx` を 1 行修正し、button 内表示を `options.find(o => o.value === value)?.label ?? value` に変更する (既存 callers は `value === label` で運用しているため挙動変化なし)                                                                                |
| `Select` の dropdown は `position: absolute` + `z-10` で、`TagFilterPopover` の `overflow-y-auto` 内に開くため、popover の下端近くで Select を開くと dropdown が clip される可能性 | 暫定対応: popover の `max-h-[80vh]` を十分大きく保ち、operator dropdown 自体は 6 行と短いので深刻な clip にはなりにくい。問題が観測された場合は Select の `Portal` 化または「上方向に開く」ヒューリスティクスを後続で追加                                       |

## Migration Plan

データ移行は不要。本 change は純粋な機能追加:

1. `filters` パラメータは `Option<Vec<TagFilterDto>>` で `None` がデフォルト
2. 既存の `listTasks(query?)` 呼び出しは `filters` を省略するため従来通り動作
3. 既存テストはすべてそのまま動作 (新規テストを追加するのみ)
4. `tauri-plugin-store` ストアファイルが無い場合は空オブジェクトとして扱う

ロールバック: 旧バージョンへの戻しでは `list_tasks` シグネチャ違いになるが、Tauri の引数バインディングは余分なフィールドを無視するため、新フロントエンド → 旧バックエンドでは `filters` が単純に無視される (= フィルタ無し動作)。逆方向 (旧フロント → 新バックエンド) は `filters: None` でこれも無問題。

## Open Questions

- ストア LRU の実装は本 change に入れるか? — **不要 (将来検討)**。実用上 50 ワークスペースを超えるケースは稀
- `list_all_tags` コマンドのキャッシュ整合性: タスク作成直後に呼ぶと既存タグ + 新タグが反映されているか? — `tasks_cache` を更新するパス (`list_tasks(None)` 時) と同じタイミングで全タグを抽出するため整合する
- タグ rename 機能との整合性 (将来) — タグ rename を行う将来 change では、フィルタストア内の同名タグも追従更新する必要がある。本 change ではスコープ外
- フィルタが多数 (>20) の場合のパフォーマンス — 50ms 程度の遅延は許容範囲。実測値は実装後に確認
