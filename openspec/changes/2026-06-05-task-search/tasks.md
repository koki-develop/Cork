## 1. Rust バックエンド — 依存関係

- [ ] 1.1 `src-tauri/Cargo.toml` に `nucleo-matcher` を追加
- [ ] 1.2 `cargo build --manifest-path src-tauri/Cargo.toml` が通ることを確認

## 2. Rust バックエンド — AppState にタスクキャッシュ

- [ ] 2.1 `src-tauri/src/state.rs` の `AppState` に `tasks_cache: Mutex<Option<Vec<Task>>>` フィールドを追加
- [ ] 2.2 `AppState` に `get_cached_tasks() -> Option<Vec<Task>>` メソッドを追加 (lock → clone → return)
- [ ] 2.3 `AppState` に `set_cached_tasks(tasks: Vec<Task>)` メソッドを追加
- [ ] 2.4 `AppState` の `set_workspace()` でキャッシュもクリアする (ワークスペース切替時)
- [ ] 2.5 `state.rs` のコンストラクタ `AppState::new()` でキャッシュを `None` で初期化
- [ ] 2.6 `state.rs` の既存テストにキャッシュの read/write/clear テストを追加
- [ ] 2.7 `cargo test --manifest-path src-tauri/Cargo.toml` がパスすることを確認

## 3. Rust バックエンド — list_tasks に query パラメータ + キャッシュ利用

- [ ] 3.1 `src-tauri/src/task.rs` の `list_tasks` 関数シグネチャに `query: Option<String>` を追加
- [ ] 3.2 `query` が `None` または空文字列の場合: ファイル読み込み + キャッシュ更新 + 全件返却 (従来動作)
- [ ] 3.3 `query` が非空の場合: `state.get_cached_tasks()` からキャッシュを取得 → `nucleo_matcher::pattern::Pattern` で各タスクの `title` を fuzzy matching → マッチしたタスクのみフィルタリングして返却
- [ ] 3.4 キャッシュが空 (`None`) で query が非空の場合: ファイル読み込み + キャッシュ更新後にフィルタリングする (フォールバック)
- [ ] 3.5 フィルタリング後のタスクは従来通り `order` → `title` でソート
- [ ] 3.6 `use nucleo_matcher::{Matcher, Config}` および `use nucleo_matcher::pattern::{Pattern, CaseMatching, Normalization}` を `task.rs` の先頭に追加

## 4. Rust バックエンド — 単体テスト

- [ ] 4.1 `task.rs` のテストモジュールに以下のテストを追加:
  - `nucleo_matcher::Pattern` の基本的な動作: `"search"` が `"srch"` にマッチ、`"task"` が `"xyz"` にマッチしない
  - ケースインセンシティブ: `"Task"` が `"tASk"` にマッチ
  - 日本語のマッチ: `"日本語"` が `"本語"` にマッチ (fuzzy subsequence match)
  - 空クエリは常に全件マッチ
- [ ] 4.2 `cargo test --manifest-path src-tauri/Cargo.toml` がすべてパスすることを確認

## 5. フロントエンド — API ラッパー

- [ ] 5.1 `src/api/tasks.ts` の `listTasks` シグネチャを `(query?: string) => Promise<Task[]>` に変更
- [ ] 5.2 `query` が undefined のときは引数なしで invoke (`invoke<Task[]>("list_tasks")`)、`query` が指定されたときは `invoke<Task[]>("list_tasks", { query })` を呼ぶ
- [ ] 5.3 `bunx tsc --noEmit` でエラーが発生しないことを確認

## 6. フロントエンド — useWorkspace hook

- [ ] 6.1 `src/hooks/useWorkspace.ts` に `query` ステート (`useState<string>("")`) を追加
- [ ] 6.2 `loadTasks` の内部で `listTasks(query || undefined)` を呼ぶように変更 (空文字列のときは undefined 相当)
- [ ] 6.3 `query` が変更されるたびに `useEffect` で自動的に `loadTasks` を呼ぶ (debounce なし、即時反映)
- [ ] 6.4 既存のファイル監視 reload (`watch` のコールバック) は変更不要 — `loadTasks` が現在の `query` を自動的に使う
- [ ] 6.5 返り値のオブジェクトに `query` と `setQuery` を追加
- [ ] 6.6 `bunx tsc --noEmit` でエラーが発生しないことを確認

## 7. フロントエンド — SearchBar molecule

- [ ] 7.1 `src/components/molecules/SearchBar.tsx` を新規作成: props `{ value: string; onChange: (value: string) => void; placeholder?: string; className?: string }`
- [ ] 7.2 controlled コンポーネントとして実装: `<input>` の値は `value` prop で制御、`onChange` は `onChange(e.target.value)` を呼ぶ
- [ ] 7.3 左側に `lucide-react` の `Search` アイコン (size-4) を配置
- [ ] 7.4 スタイル:
  - container: `relative flex items-center`
  - アイコン: `pointer-events-none absolute left-2.5 text-cork-muted/50`
  - 入力: `w-48 h-8 rounded-lg bg-cork-elevated border border-cork-border/40 pl-8 pr-3 text-xs text-cork-text placeholder:text-cork-muted/30 outline-none transition-all duration-150 focus:w-64 focus:border-cork-accent focus:ring-1 focus:ring-cork-accent`
- [ ] 7.5 `aria-label="Search tasks"` を設定
- [ ] 7.6 `type="search"` とし、ブラウザ標準のクリアボタンを `[&::-webkit-search-cancel-button]:hidden` 等で非表示にする
- [ ] 7.7 Escape キーで入力クリア + blur を実装 (`onKeyDown` で `e.key === "Escape"` をハンドリング)
- [ ] 7.8 `src/components/molecules/index.ts` から `SearchBar` を re-export
- [ ] 7.9 `bunx tsc --noEmit` でエラーがないこと、`bunx biome check src` で path-restriction 違反がないことを確認

## 8. フロントエンド — AppHeader に SearchBar を統合

- [ ] 8.1 `src/components/organisms/shell/AppHeader.tsx` の props に `query: string` と `onQueryChange: (query: string) => void` を追加
- [ ] 8.2 PathDisplay の右側に `<SearchBar value={query} onChange={onQueryChange} />` を追加
- [ ] 8.3 レイアウト: 左グループ (PathDisplay + SearchBar) は `flex items-center gap-3` を維持
- [ ] 8.4 `bunx tsc --noEmit` でエラーが発生しないことを確認

## 9. フロントエンド — BoardPage の配線

- [ ] 9.1 `src/components/pages/BoardPage.tsx` の props に `query: string` と `onQueryChange: (query: string) => void` を追加
- [ ] 9.2 AppHeader に `query={query}` と `onQueryChange={onQueryChange}` を渡す
- [ ] 9.3 親 (`App.tsx`) で `useWorkspace` から `query` / `setQuery` を受け取り、BoardPage に伝播する
- [ ] 9.4 `bunx tsc --noEmit` でエラーが発生しないことを確認

## 10. 動作確認 & 仕上げ

- [ ] 10.1 `cargo test --manifest-path src-tauri/Cargo.toml` で全テスト通過
- [ ] 10.2 `bunx tsc --noEmit` で 0 エラー
- [ ] 10.3 `bunx biome check src` で 0 警告
- [ ] 10.4 `bun run tauri dev` でアプリを起動し、以下を手動検証:
  - 検索バーが AppHeader に表示される (左側、PathDisplay の隣)
  - 検索バーにフォーカスすると幅が広がるアニメーション
  - 何も入力せずに全タスクが通常通り表示される
  - 部分文字列でタスクを検索できる (例: "task" と入力 → "My Task" がヒット)
  - あいまい検索が機能する (例: "srch" と入力 → "Search Results" がヒット)
  - 大文字小文字を区別しない (例: "TASK" と入力 → "task" がヒット)
  - 日本語タイトルが検索できる (例: "日本語" と入力 → "日本語タイトル" がヒット)
  - キー入力が即座に検索に反映される (debounce なし)
  - Escape キーで入力がクリアされ、全タスク表示に戻る
  - ファイル変更 (外部エディタで .md を編集) 後も検索状態が維持される
  - 検索結果が空の場合、ボードが空になる (各カラムが非表示)
- [ ] 10.5 `openspec validate search-tasks --strict` で warnings 0
