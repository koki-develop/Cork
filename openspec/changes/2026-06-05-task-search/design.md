## Context

Cork のボードは現在、ワークスペース内の全 `.md` ファイル (タスク) をカンバン表示する。タスク数が増加すると目的のタスクを目視で探すのが困難になる。Linear / GitHub Projects などモダンなカンバンツールはすべて検索機能を持ち、タイトルに対するあいまい検索が標準的な UX となっている。

現状の関連実装:
- `list_tasks`: `src-tauri/src/task.rs` の Tauri コマンド。ワークスペース内の全 `.md` ファイルを読み込み、frontmatter をパースして `Vec<Task>` を返す。並列処理に `rayon` を使用。
- `Task` 型: `id` / `title` / `status` / `body` / `order` / `tags`。`title` はファイル名 (stem) から取得される検索対象フィールド。
- `useWorkspace`: `src/hooks/useWorkspace.ts`。`tasks` ステートを保持し、`loadTasks` で `listTasks()` を呼ぶ。ファイル監視による自動リロードもこのフックが担当。
- `AppHeader`: `src/components/organisms/shell/AppHeader.tsx`。PathDisplay + タスク数 + Settings ボタンを横一列に配置。
- スタイル: Cork はダークテーマ (`cork-bg: #020617`, `cork-surface: #0f172a`, `cork-elevated: #1e293b`, `cork-border: #334155`, `cork-muted: #94a3b8`, `cork-text: #f1f5f9`, `cork-accent: #6366f1`)。

## Goals / Non-Goals

**Goals:**
- `list_tasks` に `query: Option<String>` パラメータを追加し、非空 query ではタイトルの fuzzy matching でフィルタリングしたタスク一覧を返す
- 検索は case-insensitive (大文字小文字を区別しない)
- 検索は fuzzy matching (完全一致でなくても良い。例: "srch" → "search")
- フロントエンドは検索テキストを Rust に送信するのみで、フィルタリングロジックはすべて Rust 側で行う
- AppHeader に検索入力フィールドを設置し、入力即時 (debounce なし) でリアルタイム検索
- 既存の全タスク表示動作 (`query` 未指定時) に影響を与えない

**Non-Goals:**
- body 本文の検索 — タイトルのみ対象。body 検索は別 capability として将来検討可能
- タグによるフィルタリング — 同上
- ステータスによるフィルタリング — 同上
- ソート順の変更 — 検索結果も既存の order → title 順を維持
- 検索結果のハイライト表示 — マッチ箇所の視覚的ハイライトは v2 以降
- 検索結果のスコア順ソート — 従来の order → title ソートを維持し、スコア順にはしない
- 検索履歴 / サジェスト — 履歴や補完は後続機能
- 検索結果の空状態 (zero state) の特別なデザイン — カラムにタスクが無いだけの自然な空表示

## Decisions

### Library: `nucleo-matcher` を採用

Rust エコシステムの fuzzy matching ライブラリ候補:

| Library | バージョン | 特徴 | 判断 |
|---|---|---|---|
| `nucleo-matcher` | 0.4 | Helix エディタで実績。case-insensitive / Unicode 正規化対応。スコアリング機能。依存軽量。 | **採用**。アクティブメンテナンス、Helix での採用実績、API が充実。 |
| `fuzzy-matcher` | 0.3 | skim/tmux と同じアルゴリズム。 | 不採用。リポジトリがアーカイブされておりメンテナンスされていない。 |
| `strsim` | 0.11 | Levenshtein / Jaro / Damerau-Levenshtein 距離。 | 不採用。編集距離は「あいまい検索」より「類似度」向け。部分文字列の順不同マッチができない。 |
| `simsearch` | 0.5 | インデックスベースの検索。大文字小文字を区別しない。 | 不採用。キャッシュが無い場合のインデックス再構築が重い。 |
| 自前実装 | — | 部分文字列の contains + case-insensitive。 | 不採用。`contains` は完全な部分一致であり、ユーザが期待する「あいまい検索」(文字の抜け・順序の入れ替わりなど) を満たさない。 |

`nucleo_matcher` は:
- `Pattern::new(query, CaseMatching::Ignore, Normalization::Smart)` で大文字小文字を区別しないパターンを作成
- `pattern.score_before(&mut matcher, &title, 0)` が `Some(u16)` を返せばマッチ、`None` で非マッチ
- Unicode 正規化 (Smart) によりアクセント付き文字なども適切に扱う

### アーキテクチャ: `list_tasks` に `query` パラメータを追加

| アプローチ | 判断 |
|---|---|
| `list_tasks` に `query: Option<String>` を追加 | **採用**。1 コマンドで全タスク取得と検索をカバーする。`None` / 空文字列では従来動作。既存の `loadTasks` → `listTasks()` 呼び出しは引数なしで互換性を維持。 |
| 新規コマンド `search_tasks(query: String)` を追加 | 不採用。`list_tasks` と重複するファイル読み込みロジックが発生する。既存の `loadTasks` を検索時に呼べず、呼び出し側の分岐が複雑になる。 |
| フロントエンドのタスク state に対して Rust 側でフィルタリング (Task[] を Rust に送り返す) | 不採用。「frontend からは検索テキストを送信するだけ」の要件に反する。また全タスクのシリアライズ/デシリアライズが発生し非効率。 |
| Rust 側でタスクのキャッシュを持ち、検索時はキャッシュに対してフィルタリング | **採用**。クエリ無し `list_tasks(None)` でファイル読み込み + キャッシュ更新。クエリ有り `list_tasks(Some(q))` でキャッシュから検索。ファイル監視・操作後の reload は常に `listTasks()` (query 無し) を呼ぶためキャッシュは常に新鮮に保たれる。キャッシュの invalidation は不要 (= cache-aside パターン)。 |

### パフォーマンス: タスクキャッシュにより検索時はファイル I/O ゼロ

`list_tasks(query=None)` が呼ばれたときにファイル読み込み + cache 更新を行う。`list_tasks(query=Some(q))` はキャッシュに対してのみ fuzzy matching を実行するためファイル I/O は発生しない。

キャッシュの整合性:
- 初回読み込み時: `list_tasks(None)` → ファイル読み込み → キャッシュ更新
- タスク作成/更新/削除後: フロントエンドの `loadTasks()` → `list_tasks(None)` → ファイル再読み込み → キャッシュ更新
- 外部ファイル変更時: ファイル監視の `loadTasks()` → `list_tasks(None)` → ファイル再読み込み → キャッシュ更新
- 検索時: `list_tasks(Some("query"))` → キャッシュから読み取り → fuzzy matching → フィルタリング結果を返す

検索は完全にインメモリで動作するため、キーストローク毎に即時呼び出してもパフォーマンス問題は発生しない。`nucleo_matcher` の照合も O(n*m) (n=タイトル長, m=クエリ長) で軽量。

### UI: SearchBar を AppHeader に追加

**配置:**
```
[PathDisplay]  [SearchBar]                           [task count] [⚙]
```

PathDisplay の右、タスクカウントの左に SearchBar を配置する。中央寄せではなく左寄せで、PathDisplay と SearchBar の一体感を持たせる。

既存の AppHeader 構造:
```tsx
<header>
  <div class="flex items-center gap-3">
    <PathDisplay />
  </div>
  <div class="flex items-center gap-2">
    <Text>{taskCount}</Text>
    <IconButton />
  </div>
</header>
```

SearchBar 導入後:
```tsx
<header>
  <div class="flex items-center gap-3">
    <PathDisplay />
    <SearchBar query={query} onQueryChange={setQuery} />
  </div>
  <div class="flex items-center gap-2">
    <Text>{taskCount}</Text>
    <IconButton />
  </div>
</header>
```

**SearchBar デザイン (Cork デザイントークン準拠):**

| プロパティ | 値 |
|---|---|
| アイコン | `lucide-react` の `Search` (size-4) |
| 背景 | `bg-cork-elevated` |
| テキスト色 | `text-cork-text` |
| placeholder | `text-cork-muted/50`, "Search tasks…" |
| 枠線 | `border-cork-border/40`, focus 時 `border-cork-accent` |
| フォーカスリング | `ring-1 ring-cork-accent` |
| 角丸 | `rounded-lg` (8px) |
| 高さ | `h-8` (32px) |
| 幅 | `w-48` → focus 時 `w-64` (transition) |
| フォント | `text-xs` |
| transition | `transition-all duration-150` |

空のクエリ時は SearchBar の表示をやや控えめにし (`w-48`, `bg-cork-surface` 相当の透明度)、フォーカス時または入力時に広がるアニメーションを採用する。

### Debounce: なし (即時反映)

検索はキャッシュに対してインメモリで行われるためファイル I/O は発生しない。そのため debounce は不要とする。

実装は `useWorkspace` 内で `query` ステートを監視する `useEffect` で `loadTasks` を呼ぶ:

```typescript
const [query, setQuery] = useState("");

useEffect(() => {
  loadTasks();
}, [query]);
```

`query` が変更されるたびに即座に `listTasks(query)` が invoke される。

### SearchBar molecule を新設

`src/components/molecules/SearchBar.tsx` として新規作成:
- Props: `{ value: string; onChange: (value: string) => void; placeholder?: string; className?: string }`
- Controlled コンポーネント (状態は親が保持)
- 内部で `lucide-react` の `Search` アイコンを左に配置
- `input` の `aria-label="Search tasks"` を設定
- `type="search"` を指定し、`Enter` キーでのデフォルト動作を抑制 (リアルタイム検索のため)
- `Escape` キーで入力をクリアし `onChange("")` を呼ぶ

SearchBar は:
- 単一責務 (検索文字列入力)
- `@/api` / `@/hooks` への依存なし
- マウス・キーボード操作をサポート
- Cork のデザイントークンに準拠したスタイル

### データフロー

```
[User types in SearchBar]
  → BoardPage が useWorkspace.setQuery(値) を呼ぶ
    → useWorkspace が query ステートを更新
      → useEffect が発火 → loadTasks() を呼ぶ
        → listTasks(query) を invoke
          → Rust: list_tasks(query=Some("..."))
            → AppState のキャッシュからタスク一覧を取得
            → nucleo_matcher でタイトルを fuzzy matching
            → マッチしたタスクのみ Vec<Task> で返す
        → setTasks(filteredTasks)
          → BoardPage が再レンダリング
            → KanbanColumn が更新された tasksByColumn を描画

[初回ロード / 作成/更新/削除後 / ファイル変更検知]
  → loadTasks() を呼ぶ (query はそのまま)
    → listTasks(query) を invoke
      → Rust: list_tasks(query=query or None)
        → query=None の場合: ファイル読み込み + キャッシュ更新 + 全件返却
        → query=Some(q) の場合: キャッシュから検索 (ファイル I/O なし)
```

### SearchBar のクリア動作

- `Escape` キー押下: 入力をクリアしフォーカスを外す (`(e.target as HTMLInputElement).blur()`)
- 入力欄右端にクリアボタン (`X` アイコン) は表示しない (type="search" のブラウザ標準クリアボタンに任せる。あるいは非表示にして Escape のみ)

方針: **Escape でクリア + blur** を基本とし、ブラウザ標準の `search` 型の ✕ ボタンは `appearance: none` で隠す。Cork は Tauri (WebView) 上で動作するため、標準クリアボタンの見た目が統一されない。

### AppState のタスクキャッシュ

`src-tauri/src/state.rs` の `AppState` に以下を追加:

```rust
pub struct AppState {
    workspace_dir: Mutex<Option<PathBuf>>,
    tasks_cache: Mutex<Option<Vec<Task>>>,
}
```

API:
- `get_cached_tasks() -> Option<Vec<Task>>` — キャッシュが存在すれば Some、なければ None
- `set_cached_tasks(tasks: Vec<Task>)` — キャッシュを設定
- `set_workspace()` の呼び出し時にキャッシュもクリアする (ワークスペース切替時)

注意点:
- `Task` 型は `src-tauri/src/task.rs` で定義されており、`state.rs` が `task.rs` をインポートするか、またはタスク型を共有モジュールに移動する必要がある。現状は `state.rs` が `task.rs` に依存しても問題ない (循環参照にならない)。
- キャッシュの初期値は `None`。`list_tasks(None)` が最初に呼ばれたときにファイル読み込み + キャッシュ設定が行われる。

### 検索結果が空の場合の表示

特別な empty state は実装しない。検索結果が空の場合、各 KanbanColumn はタスク数 0 の空カラムとして表示される (既存の「該当タスクがないカラムは非表示」ルールに従い、すべてのカラムが非表示になる)。結果としてボードは空の状態になる。これは自然な動作であり、追加の UI は不要とする。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| キャッシュと実際のディスク状態が乖離する可能性 | クエリ無しの `list_tasks(None)` が常にファイル読み込み + キャッシュ更新を行うため、キャッシュは常に新鮮。乖離が生じるのは「検索中に外部ファイルが変更され、かつファイル監視がまだ発火していない」という極小ウィンドウのみであり、既存アーキテクチャでも同様の問題は存在する。 |
| `nucleo_matcher` のクエリに特殊文字を含めた場合の意図しない動作 | `nucleo_matcher` は正規表現ではなく文字の subsequence マッチのため特殊文字のエスケープは不要。どの文字でも安全にマッチできる。 |
| キーストローク毎の即時 `listTasks` invoke で IPC オーバーヘッドが蓄積する可能性 | fuzzy matching 自体は軽量 (O(n*m)、数十 μs) であり、IPC も Tauri のゼロコピーに近い。実際に問題が観測された場合は最小限の debounce (50ms 程度) を追加することを検討するが、初回実装では 0 で進める。 |
| 検索中にファイルが作成/削除された場合の状態不整合 | ファイル監視による `loadTasks()` が現在の `query` を維持して再読み込みするため、次回検索時に自動的に解消される。 |
| `useWorkspace` の `query` が原因でファイル監視の reload 時に検索状態が意図せず変わる | `loadTasks` は常に現在の `query` を `listTasks` に渡すため、検索中にファイル変更があっても同じクエリで再検索される。問題なし。 |

## Migration Plan

データ移行は不要。本変更は純粋な機能追加であり:
1. `query` パラメータは `Option<String>` でデフォルト `None`
2. 既存の `listTasks()` (引数なし) 呼び出しは従来通り全タスクを返す
3. 既存のテストはすべてそのまま動作
4. ロールバック: 旧バージョンに戻しても `list_tasks` のシグネチャ変更でエラーになるが、フロントエンドが引数なしで呼ぶ場合は問題ない。新フロントエンドが query 引数をつけて呼んでも、旧 Rust コマンドは余分な引数を無視する (Tauri のデフォルト動作) ため互換性が保たれる。

## Open Questions

- なし。本 change のスコープは明確であり、検索機能の最小実装として完結している。body 検索・タグフィルタ・検索結果のハイライトなどは後続の独立した change として扱う。
