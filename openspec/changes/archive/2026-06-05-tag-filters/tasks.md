## 1. Rust バックエンド — 型と評価ヘルパー

- [x] 1.1 `src-tauri/src/task.rs` に `TagFilterOperator` enum (`Contains` / `NotContains` / `ContainsAny` / `ContainsAll` / `IsEmpty` / `IsNotEmpty`) を定義し、`#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)] #[serde(rename_all = "snake_case")]` を付与 (`Serialize` は永続化用にも使うため必須)
- [x] 1.2 `task.rs` に `TagFilterDto { operator: TagFilterOperator, tags: Vec<String> }` を定義し、`#[derive(Deserialize)]` + `#[serde(default)]` for tags を付与
- [x] 1.3 `task.rs` に private ヘルパー `fn tags_contains_any(task_tags: &[String], targets: &[String]) -> bool` を実装 (`targets` を 1 つでも `task_tags` が含むか)
- [x] 1.4 `task.rs` に private 関数 `fn matches_filter(task: &Task, filter: &TagFilterDto) -> bool` を実装。`Contains` / `NotContains` は `tags_contains_any` の 1 要素ケースに正規化し、`NotContains` は否定。`ContainsAny` も同ヘルパー使用。空 `filter.tags` は全 operator (`Contains` / `NotContains` / `ContainsAny` / `ContainsAll`) で `true` (skip) を返す。`IsEmpty` / `IsNotEmpty` は `task.tags.is_empty()` で判定
- [x] 1.5 `task.rs` に private 関数 `fn matches_all_filters(task: &Task, filters: &[TagFilterDto]) -> bool` を実装 (空配列は true、各 filter を `matches_filter` で AND 評価)

## 2. Rust バックエンド — list_tasks に filters 統合

- [x] 2.1 `list_tasks` シグネチャを `(query: Option<String>, filters: Option<Vec<TagFilterDto>>, state: tauri::State<'_, AppState>)` に拡張
- [x] 2.2 query 評価ブランチを統一: query が non-empty なら fuzzy match + キャッシュ、None/空 なら全件キャッシュ更新。どちらの場合も後段で filters を AND で適用
- [x] 2.3 `filters=None` または `Some(vec![])` のときは filter 評価をスキップ (全件素通し)
- [x] 2.4 ソート順は既存通り `order` → `title`。フィルタの順序が結果順に影響しないことを保証
- [x] 2.5 `query` 空文字列・`filters` 空配列は `None` と同じく「無し」として扱う

## 3. Rust バックエンド — list_all_tags コマンド

- [x] 3.1 `task.rs` に `#[tauri::command] pub fn list_all_tags(state: tauri::State<'_, AppState>) -> Vec<String>` を追加
- [x] 3.2 ワークスペース未設定時は空 `Vec` を返す (エラーにしない)
- [x] 3.3 キャッシュが `None` のときは `read_all_tasks(&dir)` でビルド + `set_cached_tasks` で保存
- [x] 3.4 キャッシュから全タスクの `tags` を `HashSet<String>` で重複排除し、`Vec::from_iter` で `Vec<String>` 化、`sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()))` で case-insensitive アルファベット順にソート (タグの原文ケースは保持)
- [x] 3.5 `lib.rs` の `tauri::generate_handler![...]` に `task::list_all_tags` を追加

## 4. Rust バックエンド — フィルタ永続化コマンド

- [x] 4.1 `task.rs` の `TagFilterOperator` を `pub use` できるように `pub` 公開し、`workspace.rs` から参照可能にする
- [x] 4.2 `src-tauri/src/workspace.rs` に `#[derive(Serialize, Deserialize, Clone)] pub struct StoredFilter { operator: TagFilterOperator, #[serde(default)] tags: Vec<String> }` を定義
- [x] 4.3 `workspace.rs` に const `FILTERS_KEY: &str = "filters"` を追加
- [x] 4.4 `#[tauri::command] pub fn get_workspace_filters(workspace_dir: String, app: tauri::AppHandle) -> CmdResult<Vec<StoredFilter>>` を実装: 既存 `SETTINGS_FILE` ストアの `FILTERS_KEY` 配下を `serde_json::Map<String, serde_json::Value>` として読み取り、`workspace_dir` をキーとして `Vec<StoredFilter>` にデシリアライズ (存在しなければ空 vec)
- [x] 4.5 `#[tauri::command] pub fn set_workspace_filters(workspace_dir: String, filters: Vec<StoredFilter>, app: tauri::AppHandle) -> CmdResult<()>` を実装: 既存の filters Map を取得 → `filters` が空配列なら該当キーを `remove`、非空なら `insert` → Map 全体が空になったら `FILTERS_KEY` キー自体を delete → `store.save()` を呼ぶ
- [x] 4.6 `lib.rs` の `tauri::generate_handler![...]` に `workspace::get_workspace_filters` と `workspace::set_workspace_filters` を追加
- [x] 4.7 `set_workspace` (`AppState`) のキャッシュクリア処理は本 change で変更なし (フィルタの永続化は store 側、キャッシュ無効化は既存通り)

## 5. Rust バックエンド — 単体テスト

- [x] 5.1 `task.rs` の test module に `matches_filter` の 6 operator × (タグ有/タグ無 タスク, operand 有/空 filter) のマトリクステストを追加
- [x] 5.2 `tags_contains_any` ヘルパーの単体テスト (空 targets で false、1 要素マッチ、複数のうち 1 つマッチ、全部不一致)
- [x] 5.3 `matches_all_filters` の AND 結合テスト (全条件マッチ / 1 つだけ不一致 / 空 filters)
- [x] 5.4 `cargo test --manifest-path src-tauri/Cargo.toml` が全テスト通過することを確認 (`workspace.rs` の永続化コマンドは `AppHandle` を要するため本 change ではユニットテスト未追加、フロント手動検証でカバー)

## 6. フロントエンド — 型定義と API ラッパー

- [x] 6.1 `src/types/filter.ts` を新規作成: `TAG_FILTER_OPERATORS` 配列定数、`TagFilterOperator` union 型、`TagFilter { id: string; operator: TagFilterOperator; tags: string[] }` 型、`StoredFilter = Omit<TagFilter, "id">` 型を export
- [x] 6.2 `src/types/index.ts` から `filter.ts` を re-export (`export * from "./filter"`)
- [x] 6.3 `src/api/tasks.ts` の `listTasks` シグネチャを `(query?: string, filters?: TagFilter[]) => Promise<Task[]>` に変更し、空値はペイロードに含めない実装 (id フィールドも除去して送信: `filters.map(({operator, tags}) => ({operator, tags}))`)
- [x] 6.4 `src/api/tasks.ts` に `listAllTags = () => invoke<string[]>("list_all_tags")` を追加
- [x] 6.5 `src/api/workspace.ts` に `getWorkspaceFilters(workspaceDir: string): Promise<StoredFilter[]>` と `setWorkspaceFilters(workspaceDir: string, filters: StoredFilter[]): Promise<void>` を追加
- [x] 6.6 `src/api/index.ts` から `listAllTags`, `getWorkspaceFilters`, `setWorkspaceFilters` を re-export
- [x] 6.7 `bunx tsc --noEmit` でエラーが出ないことを確認

## 7. フロントエンド — useFilterStore フック

- [x] 7.1 `src/hooks/useFilterStore.ts` を新規作成: `FilterStoreState = { status: "loading" } | { status: "ready"; filters: TagFilter[] }` を export
- [x] 7.2 フック `useFilterStore(workspaceDir: string | null)` が `{ state: FilterStoreState, scheduleSave: (filters: TagFilter[]) => void }` を返す
- [x] 7.3 `workspaceDir === null` のときは初期 state を `{ status: "ready", filters: [] }` とし、`getWorkspaceFilters` は呼ばない
- [x] 7.4 `workspaceDir` が変わるたびに `setState({ status: "loading" })` → `getWorkspaceFilters(workspaceDir)` を await → 解決値の `{ operator, tags }` に `crypto.randomUUID()` で `id` を補完 → `setState({ status: "ready", filters })` に遷移
- [x] 7.5 `scheduleSave` は 500ms debounce (`useRef<number | null>` で timer を保持、unmount でクリア) で `setWorkspaceFilters(workspaceDir, filters.map(({id, ...rest}) => rest))` を呼ぶ。書き込み失敗時は `console.error` のみ
- [x] 7.6 `workspaceDir` 切替時、未送信の debounce timer はキャンセル (前のワークスペースへの書き込みを発生させないため)
- [x] 7.7 `bunx tsc --noEmit` でエラーが出ないことを確認

## 8. フロントエンド — useWorkspace に filters を統合

- [x] 8.1 `src/hooks/useWorkspace.ts` で `useFilterStore(dir)` を呼び、`filterStore.state` を取得
- [x] 8.2 `filters: TagFilter[]` ステートと `filtersRef` を追加。`filterStore.state.status === "ready"` への遷移時に `setFilters(state.filters)` で同期し、`filtersRef.current = state.filters` も同期
- [x] 8.3 既存 `loadTasks` を `listTasks(queryRef.current || undefined, filtersRef.current.length > 0 ? filtersRef.current : undefined)` に変更
- [x] 8.4 `handleFiltersChange(next: TagFilter[])`: `setFilters(next)` → `filtersRef.current = next` → `filterStore.scheduleSave(next)` → `loadTasks()` を即時呼ぶ
- [x] 8.5 `query` 用 `queryIdRef` を query/filters 統合の `requestIdRef` に拡張し、`listTasks` の最新リクエストのみ反映する race 防止を実装
- [x] 8.6 `availableTags: string[]` ステートを追加
- [x] 8.7 ワークスペース切替時 (`dir` 変更 useEffect): `filterStore.state.status === "ready"` を待ってから `loadTasks()` と `listAllTags()` を順に呼ぶ。`status === "loading"` の間は `loadTasks` を発火しない
- [x] 8.8 タスク CRUD (`createTask` / `updateTask` / `deleteTask`) の完了後と、ファイル監視 (`watch`) の reload コールバック内で、`loadTasks` の後に `listAllTags()` も呼ぶ (順序: タスク→タグ、`tasks_cache` 更新後にタグを抽出)
- [x] 8.9 `handleQueryChange` も `requestIdRef` を使うように更新
- [x] 8.10 返り値オブジェクトに `filters`, `handleFiltersChange`, `availableTags` を追加
- [x] 8.11 `bunx tsc --noEmit` でエラーが出ないことを確認

## 9. フロントエンド — TagEditor 拡張 (suggestions / maxTags)

- [x] 9.1 `src/components/molecules/TagEditor.tsx` の props 型 `TagEditorProps` に `suggestions?: string[]`, `maxTags?: number`, `autoFocus?: boolean` を追加 (すべて optional、未指定で既存挙動)。`autoFocus` が true なら mount 時 useEffect で `inputRef.current?.focus()` を呼ぶ
- [x] 9.2 `maxTags` 指定時、`tags.length >= maxTags` ならば `<input>` に `disabled` 属性を付与 (DOM 要素は残してフォーカス順を保つ)
- [x] 9.3 `suggestions` 指定時、入力欄フォーカスで suggestion popover を開く (フォーカス外し or Esc で閉じる)
- [x] 9.4 candidate filtering: `pending` 文字列に対する **fuzzy subsequence match** を case-insensitive で実装 (各候補について `pending` の各文字が順番に出現するかチェック)。`pending` が空のときは全候補
- [x] 9.5 候補 popover の表示要素: 候補テキストのみ (件数表示は本 change スコープ外。`@/api`/`@/hooks` 依存禁止層なため tasks 数を渡せない)
- [x] 9.6 既選択タグ (`tags` に含まれる) は `text-cork-muted/40 line-through` で disabled。クリック / Enter で選択不可
- [x] 9.7 キーボード: ↑/↓ でハイライト移動、Enter で `commitPending` ロジックに統合 (既存 trim / dedup を再利用)、Esc で popover のみ閉じる (`e.stopPropagation()` で親 Modal/Popover の Esc を抑制)
- [x] 9.8 マウスホバーで selectedIndex を更新 (マウス・キーボード両対応)
- [x] 9.9 popover スタイル: `w-[260px] max-h-[200px] overflow-y-auto bg-cork-surface border border-cork-border/60 rounded-lg shadow-2xl z-50 text-xs`、各候補 `px-2 py-1.5`、ハイライト `bg-cork-accent/15 text-cork-accent-hover`
- [x] 9.10 既存テスト範囲 (`task-tags` capability の TagEditor シナリオ) を破壊しないことを手動チェック (suggestions 未指定で従来挙動)
- [x] 9.11 `bunx tsc --noEmit` で 0 エラー

## 10. フロントエンド — TagOperandInput molecule

- [x] 10.1 `src/components/molecules/TagOperandInput.tsx` を新規作成: props `{ mode: "single" | "multi" | "none", tags: string[], onChange: (next: string[]) => void, availableTags: string[], ariaLabel?: string, autoFocus?: boolean }`
- [x] 10.2 `mode === "none"` で `null` を return
- [x] 10.3 `mode === "single"` で `<TagEditor tags={tags} onChange={onChange} suggestions={availableTags} maxTags={1} ariaLabel={ariaLabel} autoFocus={autoFocus} />`
- [x] 10.4 `mode === "multi"` で `<TagEditor tags={tags} onChange={onChange} suggestions={availableTags} ariaLabel={ariaLabel} autoFocus={autoFocus} />`
- [x] 10.5 placeholder は親 (`FilterRow`) で TagEditor の `placeholder` プロップを介して上書きしない (既存の "Add tag" デフォルトでよい)
- [x] 10.6 `src/components/molecules/index.ts` から re-export

## 11. フロントエンド — Select の微修正と FilterRow molecule

- [x] 11.1 `src/components/molecules/Select.tsx` の button 内表示を `value` から `options.find((o) => o.value === value)?.label ?? value` に変更 (既存 callers は `value === label` で動いているため挙動変化なし、本 change で `value !== label` ケースが追加されるため必要)
- [x] 11.2 `src/components/molecules/FilterRow.tsx` を新規作成: props `{ filter: TagFilter, onChange: (next: TagFilter) => void, onRemove: () => void, availableTags: string[], autoFocus?: boolean }` (autoFocus は TagOperandInput に素通し)
- [x] 11.3 Operator select は `Select` molecule を流用、6 オペレータをそのまま列挙 (セパレータは省略 — 6 項目なら視認性に問題なし)
- [x] 11.4 オペレータ表示ラベルは "contains" / "not contains" / "contains any of" / "contains all of" / "is empty" / "is not empty"、value は `TagFilterOperator` union (`"contains"` / `"not_contains"` / ...) と一致
- [x] 11.5 オペレータ変更時、`is_empty`/`is_not_empty` への切替で `tags` を `[]` にリセット
- [x] 11.6 `TagOperandInput` を operator に応じた mode で配置: `contains`/`not_contains` → `"single"`、`contains_any`/`contains_all` → `"multi"`、`is_empty`/`is_not_empty` → `"none"`
- [x] 11.7 右端に `IconButton` の X (Remove) ボタンを配置、`aria-label="Remove filter"` を付与
- [x] 11.8 行レイアウト: Operator select `w-[140px]`, operand `flex-1 min-w-0`, remove `w-7 shrink-0`, `gap-2`
- [x] 11.9 存在しないタグ参照 (`availableTags` に無いチップ) には右に `AlertCircle` (size-3, `text-cork-muted/80`) を出し、`title="Tag no longer exists in this workspace"` を付与
- [x] 11.10 `src/components/molecules/index.ts` から re-export

## 12. フロントエンド — FilterButton molecule

- [x] 12.1 `src/components/molecules/FilterButton.tsx` を新規作成: props `{ count: number, isOpen: boolean, onClick: () => void }`、`forwardRef<HTMLButtonElement>` で ref を受ける
- [x] 12.2 `ListFilter` (lucide) アイコン (size-3.5) + "Filter" テキスト
- [x] 12.3 `count > 0` のときバッジを表示 (`bg-cork-accent text-white` の `h-4 min-w-4 rounded-full px-1 text-[10px]`)
- [x] 12.4 `count > 0` のとき border を `border-cork-accent/50` にハイライト
- [x] 12.5 `aria-expanded={isOpen}` と `aria-haspopup="dialog"` を付与
- [x] 12.6 `cursor-pointer`, focus ring (`focus-visible:ring-1 focus-visible:ring-cork-accent`), hover (`hover:border-cork-border/60 hover:bg-cork-elevated`) を実装
- [x] 12.7 `src/components/molecules/index.ts` から re-export

## 13. フロントエンド — TagFilterPopover organism

- [x] 13.1 `src/components/organisms/shell/TagFilterPopover.tsx` を新規作成: props `{ isOpen: boolean, onClose: () => void, anchorRef: RefObject<HTMLElement>, filters: TagFilter[], onFiltersChange: (next: TagFilter[]) => void, availableTags: string[] }`
- [x] 13.2 popover 描画: anchor の `getBoundingClientRect()` から位置計算し `position: fixed` で配置 (シンプルさのため React Portal 不使用)、`z-40` (Modal の `z-50` 未満)
- [x] 13.3 popover 外クリックで閉じる (`useEffect` で `mousedown` を listen、ref に含まれない要素なら `onClose`)
- [x] 13.4 Esc キーで閉じる (popover 内 keydown を listen)。TagEditor 内の suggestion popover の Esc は `stopPropagation` で親に到達しない
- [x] 13.5 Header: "Filters (N)" + "Clear all" (N > 0 時のみ)
- [x] 13.6 Body: フィルタ 0 件で空状態 (`ListFilter` アイコン + "No filters applied" + 説明文 + primary `+ Add filter`)、1 件以上で `FilterRow` 縦並び + 行間に "and" divider
- [x] 13.7 Footer: ghost `+ Add filter` ボタン (フィルタ 1 件以上のとき)
- [x] 13.8 `+ Add filter` クリックで `{id: crypto.randomUUID(), operator: "contains", tags: []}` を追加。追加した行の `FilterRow` に `autoFocus` を渡し (新規追加分のみ true、それ以外は false)、TagEditor が mount 時に input にフォーカス
- [x] 13.9 "Clear all" クリックで `onFiltersChange([])`、popover は閉じない
- [x] 13.10 popover サイズ: `w-[480px] max-h-[80vh] overflow-y-auto`, `bg-cork-surface border-cork-border/60 rounded-xl shadow-2xl p-4`
- [x] 13.11 `role="dialog"` `aria-label="Filter tasks"` を付与、フォーカストラップを実装 (popover オープン中は内部要素を周回)
- [x] 13.12 popover が `isOpen` で開いた直後 (useEffect or autoFocus), 内部の最初の操作可能要素にフォーカスを移す: 空状態時は `+ Add filter` primary button、フィルタ存在時は 1 行目の Operator Select
- [x] 13.13 close 時にトリガーボタン (`anchorRef.current`) にフォーカスを戻す
- [x] 13.14 `src/components/organisms/shell/index.ts` から re-export

## 14. フロントエンド — BoardPage 配線

- [x] 14.1 `src/components/pages/BoardPage.tsx` の props に `filters: TagFilter[]`, `onFiltersChange: (next: TagFilter[]) => void`, `availableTags: string[]` を追加
- [x] 14.2 popover の open ステート (`filterOpen`) と anchor ref (`filterButtonRef`) を `BoardPage` のローカル state として保持
- [x] 14.3 toolbar slot に `SearchBar` の右側に `<FilterButton ref={filterButtonRef} count={filters.length} isOpen={filterOpen} onClick={() => setFilterOpen(true)} />` を配置 (`flex items-center gap-2`)
- [x] 14.4 `<TagFilterPopover isOpen={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterButtonRef} filters={filters} onFiltersChange={onFiltersChange} availableTags={availableTags} />` を `<BoardLayout>` の外で描画
- [x] 14.5 `Cmd/Ctrl+Shift+F` ショートカット: `useEffect` で `keydown` リスナーを登録、`metaKey/ctrlKey` + `shiftKey` + `key === "f"` で `setFilterOpen(true)` (既存の SearchBar `Cmd/Ctrl+F` パターンを参考に、return でクリーンアップ)
- [x] 14.6 タスク 0 件 + (`searchQuery !== "" || filters.length > 0`) のとき、カラム群 (`columnOrder.map(...)`) の代わりに empty state JSX を表示 (中央寄せの `ListFilter` アイコン + "No tasks match the current filters." + "Clear all filters" / "Edit filters" の 2 ボタン)
- [x] 14.7 empty state の "Clear all filters" で `onFiltersChange([])` + `onSearchChange("")` を呼ぶ
- [x] 14.8 empty state の "Edit filters" で `setFilterOpen(true)` を呼ぶ

## 15. フロントエンド — App.tsx の配線

- [x] 15.1 `src/App.tsx` で `useWorkspace` から `filters` / `handleFiltersChange` / `availableTags` を取り出し、`BoardPage` に `filters` / `onFiltersChange` / `availableTags` として渡す
- [x] 15.2 `bunx tsc --noEmit` でエラーがないこと、`bunx biome check src` で path-restriction 違反がないことを確認

## 16. 動作確認と仕上げ

- [x] 16.1 `cargo test --manifest-path src-tauri/Cargo.toml` で全テスト通過
- [x] 16.2 `bunx tsc --noEmit` で 0 エラー
- [x] 16.3 `bunx biome check src` で 0 警告
- [x] 16.4 `bun run tauri dev` でアプリを起動し、以下を手動検証:
  - Filter ボタンが SearchBar の右に表示される (muted トーン、件数バッジなし)
  - Filter ボタンクリックで popover が開き、空状態 UI が中央表示される
  - `+ Add filter` で新規行が追加され、operand input にフォーカスが移る
  - operator を変更すると operand input の表示が切り替わる (single / multi / none)
  - operand input フォーカスで existing tags の候補ポップオーバーが出る (件数表示なし)
  - fuzzy match で候補が絞り込まれる (例: "fr" → "Frontend" / "feature")
  - 既選択タグは disabled で line-through 表示
  - 候補に無いタグも自由入力で追加できる
  - フィルタ変更で即座にボードのタスク表示が更新される
  - Clear all で全フィルタが消え、空状態 UI に戻る
  - フィルタ適用中は Filter ボタンに件数バッジが表示される
  - フィルタ + query の併用で AND 結合される
  - フィルタ 0 件結果のとき empty state が表示され、"Clear all filters" / "Edit filters" が動作する
  - ワークスペースを切り替えるとフィルタが独立してロードされる (loading 中はボード再描画が起きない)
  - アプリ再起動後、前回のフィルタが復元される
  - Cmd/Ctrl+Shift+F で popover が開く
  - Esc / popover 外クリックで popover が閉じる
  - close 時に Filter ボタンにフォーカスが戻る
  - 長いタグ名がチップで truncate される
  - 多数フィルタ (10+) で popover がスクロール可能
  - 外部エディタで新タグ付きタスクを追加すると suggestion 候補にも反映される
  - 存在しないタグを参照しているフィルタは AlertCircle アイコンで示される
- [x] 16.5 `openspec validate tag-filters --strict` で warnings 0
