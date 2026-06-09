# multi-window Specification

## Purpose

1 プロセスで複数のウィンドウを同時に展開し、各ウィンドウが独立したワークスペース・タスクキャッシュ・状態変化検知スナップショットを持つことを保証する。`File > New Window` メニュー、ウィンドウラベルごとに分離された `AppState`、macOS Dock リオープン応答、フォーカスウィンドウへの Settings イベント emit、ウィンドウクローズ時のメモリクリーンアップ、内部書き込みコマンドの cross-window 安全性 invariant を規定する。

## Requirements

### Requirement: ユーザーは `File > New Window` メニューから新規ウィンドウを開ける

アプリケーションメニューには `File` サブメニューがあり、その配下に `New Window` メニューアイテムが存在しなければならない (MUST)。`New Window` のアクセラレータは `CmdOrCtrl+Shift+N` でなければならない (MUST)。クリックまたはアクセラレータ押下のいずれかで新規 `WebviewWindow` が生成され、フォーカスを受け取り、ウィンドウサイズ・タイトルバースタイル・背景色はメインウィンドウと同一であること (SHALL)。

#### Scenario: `File > New Window` で新規ウィンドウが開く

- **GIVEN** Cork が起動済みでメインウィンドウが 1 枚開いている
- **WHEN** ユーザーがメニューバーから `File > New Window` をクリックする
- **THEN** 新しいウィンドウが画面に生成される
- **AND** 既存のメインウィンドウはそのまま残る
- **AND** 新ウィンドウは `1280 x 800` の論理サイズで開く
- **AND** macOS では新ウィンドウの背景色がメインウィンドウと同一の `#020617` で初期化される

#### Scenario: アクセラレータ `Cmd+Shift+N` で新規ウィンドウが開く

- **GIVEN** Cork のいずれかのウィンドウがフォーカスを持っている
- **WHEN** ユーザーが `Cmd+Shift+N` (macOS) または `Ctrl+Shift+N` (それ以外の OS) を押下する
- **THEN** メニューイベント `new_window` が発火する
- **AND** 新ウィンドウが生成される

#### Scenario: 新ウィンドウのラベルは `workspace-<n>` のユニーク連番

- **GIVEN** Cork が起動してメインウィンドウのラベルは `"main"` である
- **WHEN** ユーザーが `New Window` を 3 回続けて実行する
- **THEN** 生成されるウィンドウのラベルはそれぞれ `workspace-1`, `workspace-2`, `workspace-3` であり、互いに重複しない
- **AND** ラベル採番カウンタはプロセス内で単調増加し、ウィンドウを閉じても以前のラベルを再利用しない

### Requirement: 新規ウィンドウは「ワークスペース未選択」状態で起動する

`File > New Window` で生成された新規ウィンドウは、`AppState` に当該ウィンドウラベル用のワークスペースエントリを持たない状態でロードされなければならない (MUST)。その結果、フロントエンドの `getWorkspaceDirectory()` 呼び出しは `null` を返し、WelcomePage が描画される (SHALL)。既存ウィンドウのワークスペースが新ウィンドウに継承されてはならない (MUST NOT)。

#### Scenario: 新ウィンドウは WelcomePage を表示する

- **GIVEN** メインウィンドウがワークスペース `/path/to/A` を開いた状態である
- **WHEN** ユーザーが `New Window` で新ウィンドウを開く
- **THEN** 新ウィンドウは BoardPage ではなく WelcomePage を表示する
- **AND** 新ウィンドウから `get_workspace_directory` を呼ぶと `null` が返る
- **AND** メインウィンドウのワークスペースは引き続き `/path/to/A` を指す

#### Scenario: 新ウィンドウが履歴を勝手に復元しない

- **GIVEN** `workspace_history` に `[/path/to/A, /path/to/B]` の 2 件があり、`/path/to/A` が現在メインウィンドウで開かれている
- **WHEN** ユーザーが `New Window` で新ウィンドウを開く
- **THEN** 新ウィンドウは履歴の `/path/to/B` を自動で開かない
- **AND** 新ウィンドウは WelcomePage を表示する

### Requirement: AppState はウィンドウラベルをキーにスコープごとに分離された状態を保持する

`AppState` のワークスペースパス、タスクキャッシュ、`last_reported` スナップショットは、ウィンドウラベル (`String`) をキーとするマップで保持されなければならない (MUST)。各 `#[tauri::command]` は呼び出し元 `tauri::WebviewWindow` のラベルを用いて自ウィンドウ専用のスコープのみを参照・更新する (MUST)。他ウィンドウのスコープが副作用として変化することはあってはならない (MUST NOT)。

#### Scenario: 2 ウィンドウが別ワークスペースを独立して保持する

- **GIVEN** ウィンドウ `main` がワークスペース `/path/to/A` を開いている
- **AND** ウィンドウ `workspace-1` がワークスペース `/path/to/B` を開いている
- **WHEN** ウィンドウ `workspace-1` から `get_workspace_directory` を呼ぶ
- **THEN** `/path/to/B` が返る
- **AND** ウィンドウ `main` から `get_workspace_directory` を呼ぶと `/path/to/A` が返る

#### Scenario: タスクキャッシュはウィンドウごとに独立

- **GIVEN** ウィンドウ `main` がワークスペース `/path/to/A` のタスク一覧をキャッシュ済み
- **WHEN** ウィンドウ `workspace-1` が初めて `list_tasks` を呼ぶ
- **THEN** ウィンドウ `workspace-1` は自身のスコープのキャッシュを参照する
- **AND** ウィンドウ `main` のキャッシュが空になることはない

#### Scenario: `last_reported` スナップショットはウィンドウごとに独立

- **GIVEN** ウィンドウ `main` がワークスペース `/path/to/A` を開き、ある時点でのタスクスナップショットを `last_reported` に保持している
- **WHEN** ウィンドウ `workspace-1` が同じワークスペース `/path/to/A` を開き、`list_tasks` でスナップショットをシードする
- **THEN** ウィンドウ `workspace-1` の `last_reported` は自スコープにのみ書き込まれる
- **AND** ウィンドウ `main` の既存スナップショットは変化しない

### Requirement: ウィンドウクローズ時に AppState の該当エントリは破棄される

`WindowEvent::Destroyed` が発火したとき、`AppState` の `workspaces` / `tasks_caches` / `last_reported` の各マップから当該ウィンドウラベルのエントリが削除されなければならない (MUST)。ウィンドウクローズ後、長期セッションにわたって `AppState` の `HashMap` が無限に肥大化してはならない (MUST NOT)。

#### Scenario: ウィンドウを閉じると AppState エントリが消える

- **GIVEN** ウィンドウ `workspace-1` がワークスペース `/path/to/B` を保持している
- **WHEN** ユーザーがそのウィンドウを `Cmd+W` または `×` ボタンで閉じる
- **AND** `WindowEvent::Destroyed` が発火する
- **THEN** `AppState.workspaces` から `workspace-1` キーが削除される
- **AND** `AppState.tasks_caches` から `workspace-1` キーが削除される
- **AND** `AppState.last_reported` から `workspace-1` キーが削除される

#### Scenario: cleanup 経路は `Destroyed` のみで `CloseRequested` では発火しない

- **GIVEN** 将来「閉じる前に確認」機能が `prevent_close()` を呼ぶように追加された場合を想定する
- **WHEN** `CloseRequested` で `prevent_close()` が呼ばれ、ウィンドウが閉じない
- **THEN** `AppState` のエントリは依然として残っている
- **AND** ユーザーが続けてキャンセルし、最終的にウィンドウが本当に破棄されたときにのみ cleanup が動く

### Requirement: メインウィンドウ起動時に履歴の先頭からワークスペースを自動復元する

アプリケーション起動時、`lib.rs::setup()` は永続化済みの `workspace_history` を読み込み、`is_dir()` で実在確認できる最初のパスがあれば `AppState` の `"main"` ウィンドウキーにそのパスをシードしなければならない (MUST)。同時に `fs_scope().allow_directory(path, false)` の登録も行うこと (SHALL)。`get_workspace_directory` 自身には履歴からの自動復元ロジックを持たせてはならない (MUST NOT)。

#### Scenario: 起動時に直前のワークスペースが復元される

- **GIVEN** 前回 Cork 終了時のメインウィンドウは `/path/to/A` を開いており、これは履歴の先頭にある
- **AND** `/path/to/A` は現在もディレクトリとして実在する
- **WHEN** Cork を起動する
- **THEN** メインウィンドウは BoardPage を表示する
- **AND** ボードのコンテンツは `/path/to/A` 配下のタスクで埋まる

#### Scenario: 履歴先頭が無効でも次の生存しているパスを使う

- **GIVEN** 履歴が `[/path/to/missing, /path/to/A]` で、先頭の `/path/to/missing` は既に削除済み
- **AND** `/path/to/A` は実在する
- **WHEN** Cork を起動する
- **THEN** メインウィンドウは `/path/to/A` を開く
- **AND** 履歴の永続データから `/path/to/missing` は削除されない

#### Scenario: 履歴が全部無効 / 空の場合は WelcomePage

- **GIVEN** 履歴が空、または履歴のすべてのパスが `is_dir()` で false を返す
- **WHEN** Cork を起動する
- **THEN** メインウィンドウは WelcomePage を表示する
- **AND** ヘッダや BoardPage は描画されない

### Requirement: メニューイベント `Settings` はフォーカス中のウィンドウにのみ emit される

`Cmd+,` (Settings メニュー) で `menu:open-settings` イベントが発火するとき、イベントは `app.get_focused_window()` で取得した単一の `WebviewWindow` にのみ送られなければならない (MUST)。フォーカスを持たないウィンドウが Settings ダイアログを意図せず開いてしまってはならない (MUST NOT)。

#### Scenario: フォーカスウィンドウのみ Settings が開く

- **GIVEN** ウィンドウ `main` とウィンドウ `workspace-1` が両方開いており、`workspace-1` にフォーカスがある
- **WHEN** ユーザーが `Cmd+,` を押下する
- **THEN** ウィンドウ `workspace-1` でのみ Settings ダイアログが開く
- **AND** ウィンドウ `main` の Settings ダイアログは開かない

#### Scenario: フォーカスがどこにもないときは Settings イベントが消える

- **GIVEN** Cork のすべてのウィンドウがバックグラウンドで、フォーカスは他アプリにある
- **WHEN** メニューの `Settings` がプログラム的に発火する
- **THEN** `app.get_focused_window()` は `None` を返す
- **AND** イベントはどこにも emit されない (実害ゼロ — Settings が開かないだけ)

### Requirement: macOS Dock リオープンは「真に 0 枚なら復元 / 隠れているなら再表示」で分岐する

macOS で Tauri の `RunEvent::Reopen { has_visible_windows: false, .. }` ハンドラが発火したとき、システムは `app.webview_windows()` の現在のウィンドウ集合を取得し、次の通り分岐しなければならない (MUST):

- **(A) `webview_windows().is_empty()` が true** (本当に 1 枚もウィンドウが存在しない、すべて `Cmd+W` で閉じられた): 新規 `WebviewWindow` を `state.next_window_label()` で採番した `workspace-<n>` ラベルで生成し、生成前 (build より前) に履歴の自動復元シード処理 (`workspace_history` の先頭から `is_dir()` を通る最初のパスを AppState にセットし `fs_scope().allow_directory` を登録) を実施する (MUST)。
- **(B) `webview_windows()` に 1 件以上ある** (`Cmd+H` で隠した状態、または `Cmd+M` で最小化した状態): すべての既存ウィンドウに対し `unminimize()` → `show()` → `set_focus()` を呼んで再表示する (MUST)。新規ウィンドウを追加で生成してはならない (MUST NOT)。

起動経路 (`setup()` 内) を除き、`main` ラベルを再利用してはならない (MUST NOT)。`has_visible_windows: true` のリオープン (まだ見えるウィンドウがある状態でのアイコンクリック) では新規ウィンドウを生成してはならず、何もしない (macOS の標準フォアグラウンド復帰に委ねる) (MUST)。

履歴自動復元シードは `build()` を呼ぶ**前**に完了させなければならない (MUST)。これは、`WebviewWindowBuilder::build()` が webview を生成して同期 return した後、フロントエンドの JS ロードと `getWorkspaceDirectory()` 呼び出しが非同期で別スレッドで進行するため、build 後に seed すると「フロントが None を読んだ直後に seed が走る」レースが発生し得るため。

#### Scenario: Dock からのリオープンで履歴ワークスペースが復帰する

- **GIVEN** Cork が起動済みで、ユーザーは `/path/to/A` でしばらく作業し、その後すべてのウィンドウを `Cmd+W` で閉じた
- **AND** Cork プロセスは macOS 規約に従いバックグラウンドで生き続けている
- **AND** `workspace_history` の先頭は `/path/to/A` で、実在する
- **WHEN** ユーザーが Dock の Cork アイコンをクリックする
- **THEN** `RunEvent::Reopen { has_visible_windows: false, .. }` が発火する
- **AND** 新規ウィンドウが `workspace-<n>` のラベルで生成される
- **AND** そのウィンドウは BoardPage で `/path/to/A` を表示する

#### Scenario: 履歴が無効/空でも Welcome 状態のウィンドウは開く

- **GIVEN** 履歴が全部無効、または空である
- **AND** すべてのウィンドウが閉じられている
- **WHEN** ユーザーが Dock の Cork アイコンをクリックする
- **THEN** 新規ウィンドウが `workspace-<n>` で生成される
- **AND** そのウィンドウは WelcomePage を表示する (BoardPage ではない)

#### Scenario: ウィンドウが見えている状態の Reopen は無視される

- **GIVEN** Cork のウィンドウが少なくとも 1 枚最小化されていない状態で表示されている
- **WHEN** ユーザーが Dock の Cork アイコンをクリックする (たとえば他アプリにフォーカスがあった場合のフォアグラウンド復帰)
- **THEN** `RunEvent::Reopen` の `has_visible_windows` が `true` で発火する
- **AND** Cork は新規ウィンドウを生成しない
- **AND** macOS 標準の挙動で既存ウィンドウがフォアグラウンドに戻る

#### Scenario: `Cmd+H` でアプリを隠した状態の Dock クリックは既存ウィンドウを再表示する

- **GIVEN** Cork のウィンドウ `main` がワークスペース `/path/to/A` を開いて表示されている
- **WHEN** ユーザーが `Cmd+H` で Cork アプリを隠す
- **AND** `RunEvent::Reopen { has_visible_windows: false, .. }` がこの状態で発火する (隠されているウィンドウは "visible" にカウントされない)
- **AND** ユーザーが Dock の Cork アイコンをクリックする
- **THEN** `app.webview_windows()` には `main` が依然として存在するため、`is_empty()` は false
- **AND** 新規ウィンドウは生成されない
- **AND** 既存の `main` ウィンドウに対して `show()` + `set_focus()` が呼ばれ、再表示される
- **AND** `main` のワークスペース `/path/to/A` の表示状態は隠す前と同じ

#### Scenario: すべて最小化された状態の Dock クリックは既存ウィンドウを復帰する

- **GIVEN** ウィンドウ `main` と `workspace-1` の両方が表示されており、ユーザーが両方を `Cmd+M` で最小化する
- **WHEN** `RunEvent::Reopen { has_visible_windows: false, .. }` が発火し、ユーザーが Dock の Cork アイコンをクリックする
- **THEN** `app.webview_windows()` には両ウィンドウが存在するため、`is_empty()` は false
- **AND** 新規ウィンドウは生成されない
- **AND** 両ウィンドウに対して `unminimize()` + `show()` + `set_focus()` が順に呼ばれ、Dock から復帰する

#### Scenario: Reopen で `main` ラベルは再利用されない (起動時除く)

- **GIVEN** プロセス起動後に `state.next_window_label()` は既に `workspace-3` まで採番済みである
- **AND** すべてのウィンドウが閉じられて `AppState` のマップは空である
- **WHEN** Dock リオープンが発火する
- **THEN** 新規ウィンドウのラベルは `workspace-4` (採番カウンタの続き) になる
- **AND** ラベル `main` は再利用されない (`main` ラベルは起動時の `setup()` での最初のウィンドウ生成のみで使われる)

### Requirement: 内部書き込みコマンドは status と order を必ず同時に書き込む

Cork の内部書き込みコマンドが frontmatter の `status` を変更する場合、同時に `order` も必ず frontmatter に書き込まなければならない (MUST)。これは複数ウィンドウが同じワークスペースを開いた状態で、ウィンドウ A の Cork-内部のタスク移動が、ウィンドウ B 側の `reconcile_external_status_changes` から「外部エディタによる status のみの編集」として誤判定され、ウィンドウ B が当該タスクを意図しないステータス先頭位置に移動させてしまうのを防ぐための invariant である。

具体的には:

- `move_task` は `status` 引数と `order` 引数の両方を受け取り、両方を frontmatter に書き込む (SHALL)
- `update_task` で `status` が変更されるとき、フロントエンドの `useWorkspaceTasks.updateTask` は新しい `status` での移動先カラムの最小 `order` から `Math.min(...) - 1` を計算して `order` を必ず付与する (SHALL)
- 将来追加される新規コマンドが `status` を書き換える場合、同様に `order` も必ず同時に書き込まなければならない (MUST)

この invariant に違反した内部書き込みは、他ウィンドウから外部編集と誤認され、`reconcile_external_status_changes` の `compute_reconciled_orders` (status diff あり AND order_unchanged の条件) を満たして、当該タスクを意図しないステータス先頭位置へ移動させる回帰バグを引き起こす (MUST NOT 状態)。

#### Scenario: ウィンドウ A のドラッグ移動はウィンドウ B で reconcile されない

- **GIVEN** 同じワークスペースをウィンドウ A とウィンドウ B が開いている
- **AND** 両ウィンドウのタスクスナップショットには `task = (status="Todo", order=3)` がある
- **WHEN** ウィンドウ A がタスクをドラッグして `Doing` カラムの中段 (`order=5`) に置く
- **AND** ウィンドウ A の `move_task` がディスクに `(status="Doing", order=5)` を書き込む
- **AND** ウィンドウ B のファイル watcher が発火し、`reconcile_external_status_changes` が呼ばれる
- **THEN** ウィンドウ B の `compute_reconciled_orders` は `prev_status=Todo` ≠ `task.status=Doing` (status diff あり) かつ `prev_order=3` ≠ `task.order=5` (`order_unchanged=false`) と判定する
- **AND** reconcile は当該タスクを `to_move` に含めず、`new_orders` は空のままになる
- **AND** ディスクへの追加書き込みは発生せず、タスクは A が置いた `(Doing, 5)` の位置に留まる

#### Scenario: ウィンドウ A の詳細ダイアログでのステータス変更もウィンドウ B で reconcile されない

- **GIVEN** 同じワークスペースをウィンドウ A とウィンドウ B が開いている
- **AND** 両ウィンドウのスナップショットには `task = (status="Todo", order=3)` がある
- **AND** ウィンドウ A のタスク詳細ダイアログでステータスを `Doing` に変更し保存する
- **WHEN** フロントエンドの `updateTask` ハンドラが新ステータスの移動先カラム (`Doing` 列) の `Math.min(orders) - 1` を計算して `order` を付与し、`update_task` に渡す
- **AND** バックエンドが `(status="Doing", order=<新値>)` をディスクに書き込む
- **AND** ウィンドウ B の watcher 発火 → reconcile
- **THEN** reconcile の `order_unchanged` 判定は `prev_order=3` と新 `order` の差で false になる
- **AND** タスクの位置はウィンドウ A が指定した先頭スロットに留まり、ウィンドウ B が改めて何処かに動かすことはない

#### Scenario: 真の外部エディタ編集 (status のみ手動書き換え) は reconcile で修復される

- **GIVEN** 何らかの Cork 以外のテキストエディタで `.md` ファイルの frontmatter を直接編集する
- **AND** 編集者は `status: Todo` を `status: Doing` に書き換えるが `order: 3` は触らない
- **WHEN** ファイル保存後、Cork ウィンドウの watcher が発火し、`reconcile_external_status_changes` が呼ばれる
- **THEN** `compute_reconciled_orders` は `prev_status=Todo` ≠ `task.status=Doing` かつ `prev_order=Some(3)` == `task.order=Some(3)` (`order_unchanged=true`) と判定する
- **AND** 当該タスクは `to_move` に入り、新しい `Doing` カラムの先頭にあたる `order` 値で再書き込みされる
- **AND** これは設計通りの「外部編集を見つけたらカラムの目につく位置に持っていく」挙動である

### Requirement: ウィンドウラベル区別はユーザーに露出しない

ウィンドウラベル (`main` / `workspace-<n>`) はバックエンドの状態キーおよび capability マッチングのための実装詳細であり、UI 上の文字列・装飾・機能・メニュー挙動のいかなる場所にも露出してはならない (MUST NOT)。ラベルの違いが見える形でユーザー観測可能になる挙動の差異は、唯一「ウィンドウの**作成経路**による自動復元の有無」のみであり、これも `main` 固有ではなく「起動シード経路 / Reopen 経路では復元する、`New Window` 経路では復元しない」というルールとして実装される (MUST)。

#### Scenario: タイトルバー文字列はラベルに依存しない

- **GIVEN** ウィンドウ `main` と `workspace-1` の両方が表示されている
- **WHEN** ユーザーがそれぞれのタイトルバーを目視する
- **THEN** どちらも空文字列のタイトルで表示される (`TitleBarStyle::Overlay` の overlay 表示)
- **AND** `main` / `workspace-1` などのラベル文字列はどこにも表示されない

#### Scenario: ウィンドウ装飾はラベルに依存しない

- **GIVEN** ウィンドウ `main` と `workspace-1` の両方が表示されている
- **WHEN** 視覚比較する
- **THEN** 論理サイズは両者とも `1280 x 800`
- **AND** macOS では両者とも `TitleBarStyle::Overlay` + トラフィックライト位置 `LogicalPosition(20, 28)` + 背景色 `#020617`

#### Scenario: 機能とメニュー挙動はラベルに依存しない

- **GIVEN** ウィンドウ `main` と `workspace-1` の両方が表示されている
- **WHEN** ユーザーがそれぞれのウィンドウで Settings (`Cmd+,`) や Cmd+F、Cmd+Shift+N を呼び出す
- **THEN** 両ウィンドウで挙動はまったく同じ (Settings はそのフォーカスウィンドウで開く、`Cmd+Shift+N` は新ウィンドウを生成、など)
- **AND** どちらが `main` でどちらが `workspace-1` かを UI から判別する手段はない

### Requirement: capability 設定はメインウィンドウと新規ウィンドウを共にカバーする

`src-tauri/capabilities/default.json` の `windows` フィールドは、`"main"` と `"workspace-*"` (グロブ) の両方を含まなければならない (MUST)。`core` / `opener` / `fs` / `store` の各権限は両者に同等に適用される (SHALL)。

#### Scenario: 新ウィンドウから `pick_directory` などが利用できる

- **GIVEN** `capabilities/default.json` の `windows` に `"workspace-*"` が含まれている
- **WHEN** ウィンドウ `workspace-1` のフロントエンドが `pickDirectory()` を呼ぶ
- **THEN** Tauri が権限チェックを通し、ダイアログが開く

#### Scenario: 新ウィンドウから `@tauri-apps/plugin-fs` の `watch()` が利用できる

- **GIVEN** ウィンドウ `workspace-1` のフロントエンドが workspace dir を選択済み
- **WHEN** `useWorkspaceWatcher` 内の `watch(path, ...)` が呼ばれる
- **THEN** `fs:allow-watch` 権限が `workspace-*` 経由で適用され、ウォッチが開始される
