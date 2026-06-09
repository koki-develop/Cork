# recent-workspaces-picker Specification

## Purpose

WelcomePage に「Recent Workspaces」セクションを追加し、永続化済みの `workspace_history` の中から実在ディレクトリのみをユーザーに提示する。クリックでそのワークスペースを当該ウィンドウに開き、BoardPage に遷移させる。`WelcomeLayout` のドラッグ領域 (`data-tauri-drag-region="deep"`) と、最大 50 件まで収まる縦スクロールの上限高さも本 capability の対象。

## Requirements

### Requirement: WelcomePage は履歴がある場合 Recent Workspaces セクションを表示する

WelcomePage は、マウント時に `listWorkspaceHistory()` を呼び、戻り値が空配列でなければ既存のヒーロー (ロゴ + `Select Workspace Directory` CTA) の下に `Recent Workspaces` ラベルとアイテムリストを描画しなければならない (MUST)。戻り値が空配列の場合は、リストおよび `Recent Workspaces` ラベルを描画してはならない (MUST NOT) — 既存のヒーロー単体表示と同じ見た目になる (SHALL)。

#### Scenario: 履歴が空のときヒーローのみ表示

- **GIVEN** `workspace_history` に項目が一切ない初回ユーザー
- **WHEN** Cork が WelcomePage を表示する
- **THEN** ロゴ・タイトル `Cork`・`Select Workspace Directory` ボタンのみが中央に表示される
- **AND** `Recent Workspaces` というセクションは出現しない

#### Scenario: 履歴がある場合はヒーロー + Recent Workspaces を表示

- **GIVEN** `workspace_history` に実在するパスが `/path/to/A`, `/path/to/B` の 2 件ある
- **WHEN** Cork が WelcomePage を表示する
- **THEN** ヒーロー (ロゴ + CTA) の下に `Recent Workspaces` ラベルが表示される
- **AND** その下に `/path/to/A`, `/path/to/B` の順でリスト項目が表示される

#### Scenario: 履歴ロード中はリストを描画しない

- **GIVEN** Cork が WelcomePage を初めて描画している瞬間、`listWorkspaceHistory()` の結果がまだ返っていない
- **WHEN** ユーザーが画面を見ている
- **THEN** ヒーローは即座に表示される
- **AND** `Recent Workspaces` セクションは結果が返るまで描画されない (チラつきを避けるため空配列扱いと同じ)

### Requirement: Recent Workspaces は実在ディレクトリのみを表示する

`list_workspace_history` コマンドは、永続化された `workspace_history` の中から `PathBuf::from(s).is_dir()` が true を返すパスのみをフィルタして返却しなければならない (MUST)。実在しないパスはレスポンスから除外される (SHALL)。永続化済みの `workspace_history` のデータ自体は変更してはならない (MUST NOT)。

#### Scenario: 削除済みディレクトリがリストに出ない

- **GIVEN** `workspace_history` の永続データが `[/path/to/A, /path/to/missing, /path/to/B]` で、`/path/to/missing` は既に削除されている
- **WHEN** フロントエンドが `listWorkspaceHistory()` を invoke する
- **THEN** 戻り値は `[/path/to/A, /path/to/B]` (順序保持) になる
- **AND** WelcomePage には `/path/to/A`, `/path/to/B` のみが表示される

#### Scenario: 永続データは無効パスを含んだまま保持される

- **GIVEN** 上記の状況の直後
- **WHEN** Cork を一度終了して再起動する
- **THEN** 起動時の `parse_workspace_history` は永続データから `/path/to/missing` を含む完全な配列を取得する
- **AND** 起動時の `setup()` シードは `/path/to/A` を選ぶ (`is_dir()` を通る最初のパス)
- **AND** `settings.json` の `workspace_history` キーには `/path/to/missing` が依然含まれている (一時的にアンマウントされていた可能性に備えて消さない)

#### Scenario: ファイルや非ディレクトリのパスは除外される

- **GIVEN** 何らかの理由で `workspace_history` に `/path/to/file.txt` (実体はファイル) が紛れている
- **WHEN** `listWorkspaceHistory()` を invoke する
- **THEN** 戻り値の配列に `/path/to/file.txt` は含まれない

### Requirement: Recent Workspaces 項目クリックで該当ワークスペースが当該ウィンドウに開く

ユーザーが Recent Workspaces リスト内の項目をクリックしたとき、フロントエンドは `setWorkspaceDirectory(path)` を呼んでバックエンド側で AppState の当該ウィンドウキーにパスをセットし、`App.tsx` の `dir` state を更新して `BoardPage` への遷移をトリガしなければならない (MUST)。動作は既存の「Select Workspace Directory」ボタン経由のフローと整合する (SHALL)。

#### Scenario: 履歴項目クリックで BoardPage に切り替わる

- **GIVEN** WelcomePage の Recent Workspaces に `/path/to/A` が表示されている
- **WHEN** ユーザーが `/path/to/A` の項目をクリックする
- **THEN** バックエンドの `set_workspace_directory` がそのウィンドウのラベルで呼ばれ、AppState が更新される
- **AND** `fs_scope().allow_directory(/path/to/A, false)` が登録される
- **AND** `workspace_history` の永続データで `/path/to/A` が先頭に来るよう更新される (既存の `prepend_unique_capped` 経路)
- **AND** フロントエンドの `App.tsx` の `dir` state が `/path/to/A` に更新される
- **AND** WelcomePage がアンマウントされ、BoardPage が `/path/to/A` をキーとしてマウントされる

#### Scenario: 履歴選択と CTA ピッカー選択は同等のバックエンド経路

- **GIVEN** WelcomePage が表示されている
- **WHEN** ユーザーが Recent Workspaces から `/path/to/A` を選ぶ
- **THEN** バックエンド側で発生する副作用 (AppState 更新、fs_scope 登録、history 更新) は、ユーザーが「Select Workspace Directory」ボタン → OS のディレクトリピッカーで `/path/to/A` を選んだ場合と完全に同一である

### Requirement: WelcomeLayout はウィンドウドラッグ領域を持つ

`WelcomeLayout` のルート要素には `data-tauri-drag-region="deep"` 属性が付与されなければならない (MUST)。これにより、ユーザーは Welcome 画面の空白領域をドラッグしてウィンドウを移動できる (SHALL)。ボタン (`button`, `input`, `a`, `select`, `textarea`) は既存の CSS ルール (`app-region: no-drag`) によりドラッグ対象から除外され、クリック挙動を保持する (SHALL)。

#### Scenario: Welcome 画面の余白でウィンドウを掴んで動かせる

- **GIVEN** 新規ウィンドウが WelcomePage を表示している
- **WHEN** ユーザーがロゴと CTA の周辺の余白をマウスでドラッグする
- **THEN** ウィンドウが追随して移動する

#### Scenario: CTA ボタンはドラッグせずクリックされる

- **GIVEN** WelcomePage が表示されている
- **WHEN** ユーザーが `Select Workspace Directory` ボタンを押下する
- **THEN** ボタン領域は `app-region: no-drag` のため通常のクリックイベントが発火する
- **AND** ディレクトリピッカーが開く

#### Scenario: Recent Workspaces の項目クリックもドラッグせず通る

- **GIVEN** Recent Workspaces に `/path/to/A` が表示されている
- **WHEN** ユーザーが項目をクリックする
- **THEN** `<button>` 要素 (`PathDisplay` の clickable variant) として `app-region: no-drag` 扱いになり、`onClick` が発火する

### Requirement: Recent Workspaces 一覧は縦スクロール可能で最大件数を吸収する

`workspace_history` は最大 50 件保持される可能性があるため、Recent Workspaces セクションは固定上限高さを持ち、超過分は縦スクロールで参照できなければならない (MUST)。リスト全体がページの 1 スクロール表示外まで伸びて他要素を押し下げてはならない (MUST NOT)。

#### Scenario: 50 件の履歴があってもレイアウトが崩れない

- **GIVEN** `workspace_history` に 50 件の実在パスがある
- **WHEN** WelcomePage が描画される
- **THEN** Recent Workspaces セクションは画面サイズに収まる範囲で表示される
- **AND** 残りはセクション内部のスクロールで閲覧できる
- **AND** ヒーロー (ロゴ + CTA) は依然として画面上に表示されている

#### Scenario: 履歴 1 件のときはスクロールしない

- **GIVEN** `workspace_history` に実在パスが 1 件だけある
- **WHEN** WelcomePage が描画される
- **THEN** Recent Workspaces セクション内にスクロールバーは出ない (内容が上限高さに満たないため)
