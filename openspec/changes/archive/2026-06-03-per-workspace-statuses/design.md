## Context

`get_statuses` / `save_statuses` (`src-tauri/src/lib.rs:264-288`) は現在、Tauri Store プラグインの `settings.json` というアプリ全体で 1 個のストアに `statuses` キーで書き込んでいる。`list_tasks` (`lib.rs:108-117`) のデフォルトステータスもそこから読まれており、作業ディレクトリを切り替えても同一 status 構成が共有されてしまう。

複数プロジェクトで Cork を使うと、ワークフローはプロジェクトごとに違うのが普通で、グローバル設定では実用に耐えない。設定の置き場所そのものを「作業ディレクトリの中」に移し、ディレクトリと設定をペアで持ち運べる構造に変える。

ファイル監視は `useWorkspace.ts:52-62` で既に `.md` を対象にしているので、同じ watch ループを `.cork.json` にも分岐させれば、Cork 外のエディタによる編集にも追従できる。

## Goals / Non-Goals

**Goals:**

- 作業ディレクトリ単位で statuses 設定を独立管理する
- 設定の置き場所は作業ディレクトリ直下の `.cork.json` 単一ファイル
- Cork 外で `.cork.json` を直接編集した変更を即時 UI に反映する
- グローバル設定としての statuses は完全廃止し、コード上に残らないようにする

**Non-Goals:**

- `settings.json`（グローバル）から `statuses` を `.cork.json` へ移行するマイグレーション処理（後方互換性は持たない）
- `.cork.json` のバージョニングやマイグレーション機構（最初のリリースなのでスキーマ v1 のみ）
- statuses 以外の設定（ワークスペース固有のテーマや WIP 制限など）の追加。`.cork.json` のスキーマは拡張可能な形にするが、今回入れるキーは `statuses` だけ
- `.cork.json` を作業ディレクトリの `.gitignore` に書く / 書かないの推奨（README で軽く触れる程度に留め、運用はユーザー判断）
- Workspace Directory 自体の永続化先（`settings.json` の `workspace_dir` キー）は変更しない

## Decisions

### Decision 1: ファイル名は `.cork.json` 単一ファイル

ディレクトリ（例: `.cork/config.json`）ではなく単一ファイル。

**理由:**

- ディレクトリ化すると「キャッシュ」「ログ」など安易に他のファイルを置き始めたくなる誘惑が出る。スキーマ拡張は JSON オブジェクト内で行えば十分
- ドットファイル 1 個ならエクスプローラ上の見た目もシンプルで、ユーザーがエディタで直接開きやすい
- Cork が後から削除・リネームする際の操作も単純

**代替案として検討した:**

- `.cork/config.json`（ディレクトリ形式）→ 拡張性は高いが、上記の理由で却下
- `cork.config.json`（ドットなし）→ 作業ディレクトリのトップに目立って並ぶのは UX 的にノイズ。ドット隠しの方が自然

### Decision 2: スキーマは `{ "statuses": [{ "label": string }, ...] }` のラップ形式

ルートを配列にせず、オブジェクトでくるむ。

```json
{
  "statuses": [{ "label": "Todo" }, { "label": "Doing" }, { "label": "Done" }]
}
```

**理由:**

- 今は `statuses` だけだが、将来 `version`、`board.title`、`columns.color` などを追加する余地が確実に欲しくなる。スキーマレベルで拡張可能な形にしておく
- JSON のルートが配列だと「Cork の設定ファイル」という意味付けが伝わりにくい

**代替案として検討した:**

- `version: 1` を最初から入れる → 現時点で読む側のバージョン分岐ロジックを書く意味がない。後で必要になった時点で `version` が無ければ v1 とみなす扱いで増やせる → 今回は入れない (YAGNI)

### Decision 3: バックエンド側は `.cork.json` を直接 I/O する（Tauri Store プラグインは使わない）

`tauri_plugin_store` は「アプリ全体で 1 個の store」を扱うのが前提のプラグインで、任意パスのファイルを動的に切り替える使い方には向かない。`std::fs::read_to_string` + `serde_json` で直接読み書きする。

**理由:**

- 書き込み先は `AppState.workspace_dir` から決まる単純な相対パスなので、プラグインに通す必要がない
- Tauri の fs scope は `set_workspace_directory` で `allow_directory(path, false)` してあるため、その配下の `.cork.json` は I/O 許可済み
- `tauri_plugin_store` を経由しないことで「Cork 外で書き換えてもストアのインメモリキャッシュとズレない」状態を作れる（プラグイン経由だと内部キャッシュとファイル実体の同期が必要になる）

### Decision 4: コマンドのシグネチャは `State<AppState>` だけ受ける

旧 `get_statuses(app: AppHandle)` / `save_statuses(app: AppHandle, statuses: Vec<StatusEntry>)` から変更:

```rust
#[tauri::command]
fn get_statuses(state: tauri::State<'_, AppState>) -> Vec<StatusEntry>;

#[tauri::command]
fn save_statuses(
    state: tauri::State<'_, AppState>,
    statuses: Vec<StatusEntry>,
) -> Result<(), String>;
```

`AppHandle` 経由のストア取得は不要になり、`workspace_dir` を `Mutex` から借りるだけで完結する。`list_tasks` も内部で同じ I/O 関数を呼ぶ形に揃える（プライベートヘルパー `read_statuses_from_workspace(dir: &str) -> Vec<StatusEntry>` を切る）。

### Decision 5: 作業ディレクトリ未選択時はエラー / 空配列で扱い分け

| コマンド        | 未選択時の挙動                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `get_statuses`  | `vec![]` を返す（旧仕様もストアに値が無ければ空配列だった。フロント側で `DEFAULT_STATUSES` にフォールバック済み） |
| `save_statuses` | `Err("No directory selected")` を返す                                                                             |

**理由:** `get_statuses` は起動直後の `useWorkspace` 初期ロードで `dir = null` のまま呼ばれる可能性があり、ここでエラーを返すと UI が荒れる。一方 `save_statuses` は必ずユーザー操作起点で、`dir` が無いのに保存が走るのは異常系なのでエラーにする。

### Decision 6: `.cork.json` の不在 / 不正は空配列で吸収する

- ファイルが存在しない → `get_statuses` は `vec![]`
- ファイルはあるが JSON パース失敗 → `vec![]` を返し、`eprintln!` で警告
- パースは成功したが `statuses` キーが無い / 型が違う → `vec![]`

いずれもフロントは `DEFAULT_STATUSES` を表示する。`save_statuses` が初めて呼ばれた瞬間に `.cork.json` が新規作成される。

**理由:** ユーザーが手動で書き換えてシンタックスエラーを混入したケースで Cork ごと壊れるのは UX として悪い。「設定が読めないなら一時的にデフォルト動作」が妥当。エラー表示までは今回入れない（コンソールに残せば十分）。

### Decision 7: ファイル書き込みはフォーマット済み JSON で 2 スペースインデント

`serde_json::to_string_pretty` を使う。ユーザーが Cork 外でエディタ閲覧した時に diff が読めることを優先する。末尾改行も付ける。

### Decision 8: `.cork.json` の watch は既存 `watch()` を流用

`useWorkspace.ts:52-62` の `watch(dir, ...)` は `recursive: false` で開いており、作業ディレクトリ直下の `.cork.json` 変更イベントも届く。ハンドラを次の形に拡張する:

```ts
watch(
  dir,
  (event) => {
    const hasMd = event.paths.some((p) => p.endsWith(".md"));
    const hasCork = event.paths.some((p) => p.endsWith(".cork.json"));
    if (hasCork) {
      loadStatuses();
      loadTasks(); // 既定ステータス変更がカードの所属列に影響するため
    } else if (hasMd) {
      loadTasks();
    }
  },
  { recursive: false, delayMs: 300 },
);
```

**理由:** `delayMs: 300` のデバウンスは既存値をそのまま流用。`.cork.json` 単独編集でも `loadTasks` を呼ぶのは、デフォルトステータスが変わるとフロントエンドの未指定 status カードの所属列が変化するため。

**自己更新によるループ抑制:** Cork 自身が `save_statuses` で `.cork.json` を書いた直後にも watch が発火するが、`loadStatuses` / `loadTasks` は冪等なので問題にならない。デバウンスで 300ms 以内に複数発火しても 1 回にまとめられる。

### Decision 9: 作業ディレクトリ切替時の挙動

`useWorkspace` の `dir` 変更 effect (`useWorkspace.ts:33-67`) で既に `loadStatuses` を呼んでいる。これは新仕様でも同じ流れでよい（`get_statuses` の参照先が `dir` 配下の `.cork.json` に変わるだけ）。

`set_workspace_directory` 側でも特別な処理は不要（`.cork.json` を eager にロードする必要はなく、次の `get_statuses` 呼び出しで読まれる）。

## Risks / Trade-offs

- **[Cork 外で `.cork.json` を編集中に Cork が `save_statuses` する → 上書きで内容を失う]** → Mitigation: 今回は最終書き込み勝ちで許容する。Cork の設定パネルを開いている時はそこで編集すべき、というメンタルモデル。エディタ衝突を本気で防ぐにはファイルロック等が要るが過剰。`save_statuses` 直前に `.cork.json` を読み直してマージは行わない（複雑化が見合わない）
- **[`watch()` の自己発火ループ]** → Mitigation: `loadStatuses` / `loadTasks` は副作用がストア書き込みを起こさないので発火しても収束する。デバウンス 300ms で十分丸められる
- **[`.cork.json` が JSON パース失敗で空配列に落ちる → ユーザーが statuses を消したと誤認]** → Mitigation: バックエンドで `eprintln!` する。設定パネルからユーザーが操作した瞬間に「正しい JSON で書き直されてしまう」ため、誤って構文を壊した場合は復旧が破壊的になる。今回はトレードオフ受容（タスクの frontmatter 自体は失われないし、ラベルさえ手で打ち直せばカラム表示は戻る）
- **[既存ユーザーのグローバル `statuses` 設定が消える]** → Mitigation: 仕様として明示。既存ユーザーは Cork を起動すると Todo/Doing/Done のデフォルトに戻り、設定パネルから再設定する必要がある。リリースノートで案内する
- **[`AppState.workspace_dir` の `Mutex` を保持したまま `fs::read` / `fs::write` を呼ぶと長時間ロックする]** → Mitigation: 既存コードと同様、`dir` を `clone()` して `drop(guard)` してからファイル I/O を行う。`list_tasks` (`lib.rs:101-106`) のパターンを踏襲
- **[fs scope に `.cork.json` 単独の許可が無い]** → Mitigation: 既に `set_workspace_directory` で作業ディレクトリ全体を `allow_directory(path, false)` してあり、その配下のファイル I/O は許可済み。capabilities/default.json の変更は不要
