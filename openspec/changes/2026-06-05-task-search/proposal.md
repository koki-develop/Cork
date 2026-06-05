## Why

Cork のボードは現在、全タスクを常に一覧表示している。タスク数が増える (50〜100+) と目的のタスクを目視で探すのが困難になる。Linear / GitHub Projects / Jira など、モダンなカンバンツールはほぼすべてがリアルタイム検索を備えており、Cork でも同様の体験を提供する必要がある。

検索は「タイトルに対するあいまい検索」とする。body 本文は対象外とし、カード上で最初に目に入るタイトルに絞ることでパフォーマンスと UX のバランスを取る。大小文字は区別しない。

## What Changes

- Rust バックエンド: `list_tasks` Tauri コマンドに `query: Option<String>` パラメータを追加する。`None` または空文字列の場合は全タスクを返す (従来動作)。`Some(query)` の場合はタイトルに対して case-insensitive な fuzzy matching を実施し、マッチしたタスクのみを返す。
- Rust バックエンド: fuzzy matching に `nucleo-matcher` crate を採用する。Helix エディタで実績のある fuzzy matching アルゴリズム。`fuzzy-matcher` はリポジトリがアーカイブされているため非採用。
- フロントエンド API: `src/api/tasks.ts` の `listTasks()` を `listTasks(query?: string)` に変更し、`query` があるときは Tauri invoke の引数に含める。
- フロントエンド hook: `useWorkspace` に `query` ステートを追加。`query` が変わるたびに即時 `loadTasks` を呼ぶ (debounce なし)。Rust 側にタスクキャッシュがあるため I/O は発生しない。
- UI: `AppHeader` に検索入力フィールド (SearchBar molecule) を追加。PathDisplay とタスクカウントの間に配置する。
- 検索入力は即時反映。Rust 側のタスクキャッシュに対して fuzzy matching を実行するため、ファイル I/O は発生しない (= パフォーマンスへの影響なし)。
- Rust バックエンド: `AppState` にタスクキャッシュ (`Mutex<Option<Vec<Task>>>`) を追加する。`list_tasks` は `query=None` のときファイル読み込み + キャッシュ更新、`query=Some(_)` のときキャッシュに対して検索する。
- 依存関係: Cargo.toml に `nucleo-matcher` を追加。package.json に変更なし。

## Capabilities

### New Capabilities

- `search-tasks`: タスクタイトルのあいまい検索機能。Rust バックエンドで `list_tasks` が query パラメータを受け取り、`fuzzy-matcher` による case-insensitive fuzzy matching でフィルタリングする。フロントエンドからは検索テキストを送信するのみ。UI は AppHeader 内の SearchBar で、debounce 付きリアルタイム検索を提供する。

### Modified Capabilities

- `list-tasks` (既存、capability 名としては未定義だが実質的な変更対象): `list_tasks` コマンドのシグネチャに `query: Option<String>` が追加され、フィルタリング振る舞いが拡張される。`None` / 空文字列では従来通りの全件返却。

## Impact

- **Rust バックエンド (`src-tauri/`)**: `Cargo.toml` に `nucleo-matcher` を追加。`src-tauri/src/state.rs` の `AppState` に `tasks_cache: Mutex<Option<Vec<Task>>>` を追加。`src-tauri/src/task.rs` の `list_tasks` 関数に `query: Option<String>` パラメータを追加し、`query` が非空の場合に `nucleo_matcher` でタイトルをフィルタリングする (キャッシュ利用)。戻り値の型 (`Vec<Task>`) は変更なし。
- **フロントエンド API (`src/api/tasks.ts`)**: `listTasks` のシグネチャを `(query?: string) => Promise<Task[]>` に変更。`query` が undefined のときは従来通り引数なしで invoke する。
- **フロントエンド hook (`src/hooks/useWorkspace.ts`)**: `query` ステート (string) を追加。`query` が変更されるたびに `useEffect` で `loadTasks` を呼ぶ (debounce なし)。`loadTasks` 内部で `listTasks(query \|\| undefined)` を呼ぶ。`setQuery` を公開し、BoardPage が検索入力を hook に伝播できるようにする。
- **UI コンポーネント**:
  - `AppHeader.tsx` — PathDisplay の右側に SearchBar を追加。`query` / `onQueryChange` を props で受け取る。
  - `molecules/SearchBar.tsx` (新規) — Search (lucide) アイコン + `<input>` のコンビ。Cork デザイントークン準拠のスタイル。controlled コンポーネント。
  - `BoardPage.tsx` — `useWorkspace` から `query` / `setQuery` を受け取り、AppHeader に伝播する。
  - `BoardLayout.tsx` — 変更なし (header slot が AppHeader を受け入れる既存構造)。
- **テスト (Rust)**: `task.rs` の既存テストに `list_tasks` の query フィルタリングのユニットテストを追加 (モックファイルを使用)。`nucleo_matcher` の基本的な動作確認テスト。`state.rs` にキャッシュ関連のテストを追加。
- **依存関係**: Cargo.toml に `nucleo-matcher` を追加。package.json に変更なし。
