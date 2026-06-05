## Context

設定パネル（`SettingsPanel.tsx`）には Workspace Directory と Statuses の 2 系統の編集項目がある。Statuses は `useStatusEdit` がローカル state に編集を保持し、Save ボタン押下時に `invoke("save_statuses", ...)` で永続化する。一方、Workspace Directory は `handleChangeDirectory`（`SettingsPanel.tsx:54-60`）でディレクトリピッカーを開き、選ばれたパスを `onDirectoryChange(path)` で親に伝えてその場で `onClose()` する。

Rust 側の `select_directory` コマンド（`lib.rs:36-59`）は 1 つの呼び出しで以下のすべてを行う:

- ネイティブダイアログを開いてユーザーにフォルダを選ばせる
- `state.workspace_dir`（`Mutex<Option<String>>`）を更新
- `settings.json` ストアに `workspace_dir` を永続化
- fs scope に当該ディレクトリを許可

つまり「ピッカーを開くこと」と「workspace を確定すること」が 1 コマンドに同居しており、フロントが「候補パスをユーザーに見せて、後でまとめて保存する」というセマンティクスを取りにくい構造になっている。これを変えずに UI 側だけで pending state を持ってしまうと、ピッカーを開いた時点で backend は新しいディレクトリに切り替わっているのに UI 上は元の workspace を表示し続けるという不整合が出る。

呼び出し元は 2 か所:

- `DirectoryPicker.tsx:11`: 初回起動時のディレクトリ未選択画面。ここでは「Save」概念がないので即時反映で問題ない
- `SettingsPanel.tsx:55`: 設定画面内。ここを Save 経由に変える

## Goals / Non-Goals

**Goals:**

- 設定パネル内のすべての項目を「Save 押下までは未確定」というセマンティクスに統一する
- Workspace Directory 変更は Save 押下時にのみ Rust 側 state と `settings.json` に反映される
- Cancel / Esc / 背景クリック / X ボタンによるパネル閉じは、Directory と Statuses の両方の pending 変更を破棄する
- ピッカー選択後に「未保存の新しいディレクトリ候補」が視覚的に分かる
- DirectoryPicker（初回起動画面）の挙動とユーザー体験は変えない
- Rust 側コマンドを「ピッカーを開く」「workspace を確定する」の 2 つに分割し、呼び出し元が用途に応じて組み合わせる

**Non-Goals:**

- 「未保存変更があるときに閉じようとしたら確認ダイアログを出す」などの追加 UX。今回は明示的破棄のみ実装する
- Statuses 編集ロジック（`useStatusEdit`）の変更
- workspace 切り替え後のタスク再読み込みフロー（`useWorkspace` の `useEffect`）の変更
- 旧 `select_directory` コマンドを残しての後方互換性確保。`lib.rs` とフロント呼び出しは同一コミットで書き換えるためバージョン跨ぎの互換性は不要

## Decisions

### Decision 1: Rust 側コマンドを `pick_directory` と `set_workspace_directory(path)` に分割する

旧 `select_directory` を「ピッカーを開いてパスのみ返す」純粋関数の `pick_directory` にリネーム。新たに `set_workspace_directory(path: String)` を追加し、state 更新・store 永続化・fs scope 許可をそこに集約する。

これにより:

- 設定画面: `pick_directory` で候補を取り → Save 時に `set_workspace_directory(pendingPath)` を呼ぶ
- 初回 DirectoryPicker: `pick_directory` → `set_workspace_directory` を続けて呼ぶ。挙動はユーザーから見て不変

**Alternatives considered:**

- 旧 `select_directory` を残しつつ `set_workspace_directory` だけ追加: 設定画面側で「ピッカーを開くだけで commit しないコマンド」が結局必要になるため不採用
- フロント側で `select_directory` をそのまま呼び、UI 上の dir 表示だけ pending state にする: backend と UI の状態が乖離し、Cancel で「backend は新しいディレクトリだが UI は古い表示」という壊れた状態が露呈する。不採用
- 旧 `select_directory` をそのままにし、フロントで pending path を保持。Save 時に何もしない（既に backend に反映済みのため）。Cancel 時は「旧パスを再度 `select_directory` 風コマンドで強制復元」: Cancel が「ピッカー閉じただけなのに backend を巻き戻す」副作用を持つことになり、原子性が崩れる。不採用

### Decision 2: pending 状態は SettingsPanel ローカル state に閉じ込める

`useWorkspace` や App レベルの dir state には触れず、`SettingsPanel` に `pendingDir: string | null` を持たせる。Save 成功時に親へ `onDirectoryChange(finalDir)` を呼んで App の state を更新する。

これにより:

- Cancel 時は `setPendingDir(null)` するだけで破棄完了
- 親（App）の `dir` state はこれまで通り「確定済み workspace」を表す不変条件を維持
- `useWorkspace` のディレクトリ変更時 `useEffect`（tasks/statuses ロード、ファイル監視）も「確定後にのみ走る」セマンティクスのまま

**Alternatives considered:**

- App 側に `pendingDir` を持たせる: App は「確定 workspace」だけ知っていればよく、設定パネルの編集中間状態を App が知る必要はない。責務分離の観点から SettingsPanel に閉じるのが妥当

### Decision 3: 未保存表現は「ヘッダー集約のインジケータ」+「Save ボタン disabled」の併用

「Workspace Directory も Save まで未確定」というセマンティクスは Statuses 編集にも当てはまる。両者を区別せず、設定パネル全体として「未保存変更があるか」を 1 つの状態として扱う。

具体的には:

- パネルヘッダー（"Settings" タイトル横）に `hasPendingChanges` 真のとき "• Unsaved changes" を表示（`text-cork-accent-hover` の小さな uppercase テキスト）
- `hasPendingChanges = pendingDir !== null || statusesDirty`
- `statusesDirty` は `useStatusEdit` から公開する `isDirty` で、`editing` 配列と初期 `statuses` を要素ごとに `label` 比較して算出
- Save ボタンは `disabled={isSaving || !hasPendingChanges}` とし、未保存変更がない場合は disabled で表示
- Workspace Directory セクションラベル横、Statuses セクションラベル横、には個別の Unsaved 表示を出さない（ヘッダーに集約）
- パス表示カード内のパス文字列は pending 時にそのまま「新しい候補パス」を表示する（カード自体のスタイルは変わらない）

これによりユーザーは「いま何か未保存変更があるか」をヘッダー 1 か所で把握でき、かつ Save ボタンの状態でも「押せる/押せない」のフィードバックを得る。`SettingsPanel` の `key={String(settingsOpen)}` により毎回 remount されるため、`useStatusEdit` の内部 state は開閉ごとにリセットされ、dirty 判定が次回開いた時に持ち越されない。

**Alternatives considered:**

- セクションごとに dot/badge を表示: granular だが視覚ノイズが増え、特に Workspace Directory の "• Unsaved" を残すと Statuses 側だけ出さないのは情報設計上不整合になる。不採用
- ヘッダー集約のみで Save ボタン disabled しない: Save ボタンが常に enabled だと「押したけど何も起きない」状況が起き、操作の予測可能性が下がる。不採用
- Save ボタン disabled のみで Unsaved テキストを出さない: 「何が起きていないのか」を視覚的に伝える情報がボタンの色変化だけになり、Save が disabled な理由（=変更なし）と「Save 処理中」が紛れる。両方併用が一番情報量と最小性のバランスが良い
- 「変更前 / 変更後」を両方併記: 文字量が増え、モーダル内のスペースを圧迫。不採用
- ピッカー選択直後に Save ボタンをパルスアニメーション: 視覚的ノイズが多く、設定画面のミニマルさを壊す。不採用
- Toast 通知で "Unsaved changes" を出す: パネル外に出ると気づかれにくく、`reduced-motion` 配慮も増える。インライン表示で十分

### Decision 3.5: 編集導線は「Change Directory」ボタンを廃しパス表示カード自体に統合する

下部の「Change Directory」ボタンは廃止し、パスを表示するカード自体をクリック可能にして `pick_directory` を呼ぶ導線に統合する。情報設計上、パネル上部の「Workspace Directory 表示」と「その編集操作」が同じ場所に同居することで spatial unification を満たし、下部の Cancel / Save 行は純粋な form action 行として残せる。

具体的には:

- 既存の `<p>` を `<button type="button">` に置き換え、`displayedDir` をテキストとして内部に表示
- カード右端に `FolderOpen`（lucide）アイコンを置き、クリック可能であることを示唆
- カードに `cursor-pointer`、`hover:bg-cork-elevated/90`、`hover:border-cork-border/60`、`transition-colors` を付与
- `disabled` 時は `cursor-not-allowed` と `opacity-60` で無効化を表現（Save 中）
- `aria-label="Change workspace directory"` をボタンに付与
- 下部ボタン行は `[Cancel] [Save]` の 2 つに減らし、`justify-end` で揃える

**Alternatives considered:**

- パス右脇に独立した小さなアイコンボタンを置く: 視覚要素が増え、特に narrow modal で横スペースを圧迫する。affordance は明確だが Option 1 のミニマルさに劣る。不採用
- パス下に "Change..." テキストリンクを置く: 縦方向に余分なスペースを取り、リンク文化が薄い Tauri デスクトップアプリでの認知も微妙。不採用
- 元の「下部に Change Directory ボタン」を残す: 表示と操作の位置が離れる情報設計の問題が今回の発端なので採用しない

### Decision 4: Save の実行順は「statuses → directory」

Save ボタンの `handleSaveAndClose` は次の順に処理する:

1. `handleSave()` で `save_statuses` を実行（現在の workspace に対して）
2. `pendingDir` がセットされていれば `set_workspace_directory(pendingDir)` を呼び、親に `onDirectoryChange(pendingDir)` を伝える
3. `onStatusesChange()` を呼ぶ（ただし directory が変わった場合は `useWorkspace` の `useEffect` が再ロードするので冗長にはなる）
4. `onClose()` でパネルを閉じる

statuses を先に保存することで、「設定画面を開いてステータスを編集 → ディレクトリも変更 → Save」のとき、ユーザーが編集していた statuses は編集元（旧）workspace に正しく保存される。これは現状の「直前まで見ていた workspace が編集対象」というメンタルモデルと一致する。

**Alternatives considered:**

- directory を先に切り替えてから statuses を新 workspace に保存: ユーザーが旧 workspace の statuses を編集していた直感とズレる。不採用
- どちらか一方を選ばせる UX を追加: 過剰実装。不採用

### Decision 5: handleSave がエラーを返した場合は directory の切り替えも中止する

`useStatusEdit.handleSave` は重複ラベル時に `error` state を立てて `save_statuses` を呼ばずに早期 return する。この場合 directory も切り替えず、Save ボタン押下を no-op として扱う（パネルも閉じない）。

`handleSave` は現状 boolean 等の成功フラグを返していないため、`error` state を参照するか、`handleSave` の戻り値を `Promise<boolean>` 等に拡張する必要がある。`useStatusEdit` の API を拡張する方が呼び出し側の条件分岐が読みやすい。

**Alternatives considered:**

- 失敗してもディレクトリだけ切り替える: 「Save の atomicity」が破れ、ユーザーが期待する「全部成功 or 何も起きない」と矛盾する。不採用

### Decision 6: Esc / 背景クリック / X / Cancel はすべて同じ破棄関数を呼ぶ

`onClose` を呼ぶ前に `setPendingDir(null)` を実行する関数 `discardAndClose` を `SettingsPanel` 内に作り、Esc handler・背景 button・X ボタン・Cancel ボタンの 4 か所すべてから呼ぶ。これにより閉じ方による挙動差が出ない。

実装上は `onClose` を直接置き換えても良いが、props の `onClose` は親に閉じを通知するだけのものとして残し、内部で破棄ロジックを挟むラッパーを用意するのが責務分離として明快。

## Risks / Trade-offs

- **Rust コマンド名の breaking change**: `select_directory` を `pick_directory` にリネームするため、`lib.rs` の `invoke_handler` と全フロント呼び出し（2 か所）を同一コミットで書き換える必要がある。漏れがあれば runtime エラー → コミット前に `bun run build` と `cargo check` で検出可能なので大きなリスクではない

- **Save 中にユーザーが追加でピッカーを開く競合**: `handleSaveAndClose` 中に再度「Change Directory」を押されると `pendingDir` が上書きされる。Save 中はボタンを disable にして回避する。同パターンは `handleSave` の重複押下にも適用済みの方が安全

- **初回 DirectoryPicker での 2 段階呼び出し失敗**: `pick_directory` → `set_workspace_directory` のうち後者だけ失敗した場合、ユーザーには「フォルダ選んだのに何も起きない」状態になる。`set_workspace_directory` を `Result<String, String>` で返し、失敗時はエラーログだけ出す（既存の `select_directory` も同等のサイレント失敗だった）

- **`useWorkspace` の `useEffect` 二重発火**: Save 時に statuses 保存 → directory 確定 → `onStatusesChange` → 親の `dir` 変化で `useWorkspace` の `useEffect` も走る、と 2 系統のリロードが発生し得る。directory が変わったときは `onStatusesChange` を呼ばないようガードする（パネル閉じれば次回開いた時に再フェッチされるため UX 上は問題なし）

- **ユーザーが pending 中にパネルを閉じることに気付かない**: 今回は明示的破棄のみで confirm ダイアログは出さない（Non-Goal）。"Unsaved" インジケータが警告の役割を担う。将来必要なら別 change で「未保存変更 confirm」を追加できる
