## ADDED Requirements

### Requirement: status 名変更時に所属タスクの frontmatter も同期される

`save_statuses` Tauri コマンドに古い label → 新しい label のマッピング（rename map）を渡せるようにする。rename map が空でない場合、コマンドは該当する全タスクの Markdown ファイルの frontmatter `status` フィールドを新しい label に書き換えなければならない (MUST)。

#### Scenario: status "Doing" を "In Progress" にリネームする

- **GIVEN** ワークスペースに `status: Doing` のタスクが 3 つ存在する
- **AND** `.cork.json` の statuses 配列に `{ "label": "Doing" }` が含まれている
- **WHEN** フロントエンドが `save_statuses` に新しい statuses 配列（label `"In Progress"`）と rename map `{ "Doing": "In Progress" }` を渡して invoke する
- **THEN** 3 つのタスクファイルの frontmatter `status` が全て `"In Progress"` に書き換えられる
- **AND** `.cork.json` の statuses 配列が `[{ "label": "In Progress" }]` に更新される

#### Scenario: リネーム対象のタスクが存在しない

- **GIVEN** ワークスペースに `status: Doing` のタスクが 1 つも存在しない
- **WHEN** フロントエンドが `save_statuses` に rename map `{ "Doing": "In Progress" }` を渡して invoke する
- **THEN** `.cork.json` のみ更新され、タスクファイルへの書き込みは発生しない

#### Scenario: rename map が空の場合（リネームなし）

- **GIVEN** ユーザーが status を追加・削除・並び替えした（リネームは無い）
- **WHEN** フロントエンドが `save_statuses` に空の rename map（`{}`）を渡して invoke する
- **THEN** `.cork.json` が更新される
- **AND** タスクファイルへの書き込みは一切発生しない

#### Scenario: rename map の値が同一 label の場合（実質変更なし）

- **GIVEN** rename map が `{ "Doing": "Doing" }`（key と value が同一）
- **WHEN** フロントエンドが `save_statuses` を invoke する
- **THEN** タスクファイルの書き換えはスキップされる（変更不要と判断される）

### Requirement: フロントエンドは rename map を計算し、saveStatuses 完了後にタスク一覧を再読み込みする

`useStatusEdit.persist` は保存前後の statuses 配列を比較し、label が変化した要素の rename map を計算しなければならない (MUST)。`saveStatuses` の完了後、Board が最新状態を反映するためにタスク一覧の再読み込みをトリガーしなければならない (MUST)。

#### Scenario: 単一の status をリネーム

- **GIVEN** 現在の statuses が `[Todo, Doing, Done]`
- **WHEN** ユーザーが "Doing" を "In Progress" に変更して blur する
- **THEN** `persist` が rename map `{ "Doing": "In Progress" }` を計算する
- **AND** `saveStatuses` に新しい配列 + rename map を渡す
- **AND** 完了後にタスク一覧が再読み込みされ、Board の "Doing" 列が "In Progress" に変わり、該当タスクが表示される

#### Scenario: 複数の status を同時にリネーム

- **GIVEN** 現在の statuses が `[Todo, Doing, Done]`
- **WHEN** ユーザーが一度の保存操作で "Todo" → "Backlog" かつ "Doing" → "In Progress" に変更する
- **THEN** rename map は `{ "Todo": "Backlog", "Doing": "In Progress" }` となる
- **AND** 各タスクは対応する新しい label に書き換えられる

#### Scenario: rename map が空の場合、タスク再読み込みのみ行う

- **GIVEN** ユーザーが status の並び替えのみを行った（リネーム無し）
- **WHEN** `persist` が rename map を計算する
- **THEN** rename map は `{}`（空）となる
- **AND** 従来どおり `.cork.json` の保存 + タスク一覧再読み込みが行われる

### Requirement: rename map の差分検出はラベル位置ベースで行う

rename map の計算は statuses 配列の同一インデックスにある要素の label を比較して行う (SHALL)。同一インデックスの label が異なる場合、古い label → 新しい label のエントリとして rename map に追加する。

#### Scenario: 同一インデックスの label 比較で rename を検出する

- **GIVEN** 変更前が `[{ label: "Todo" }, { label: "Doing" }, { label: "Done" }]`
- **AND** 変更後が `[{ label: "Todo" }, { label: "In Progress" }, { label: "Done" }]`
- **WHEN** フロントエンドが rename map を計算する
- **THEN** インデックス 0 と 2 は一致するためスキップ
- **AND** インデックス 1 が異なるため `{ "Doing": "In Progress" }` が生成される

#### Scenario: 要素追加時は rename と見なさない

- **GIVEN** 変更前が `[{ label: "Todo" }, { label: "Done" }]`
- **AND** 変更後が `[{ label: "Todo" }, { label: "Doing" }, { label: "Done" }]`
- **WHEN** フロントエンドが rename map を計算する
- **THEN** rename map は `{}`（空）となる
- **AND** statuses 配列の長さが異なる場合はインデックス比較の対象外となる

#### Scenario: 要素削除時も rename と見なさない

- **GIVEN** 変更前が `[{ label: "Todo" }, { label: "Doing" }, { label: "Done" }]`
- **AND** 変更後が `[{ label: "Todo" }, { label: "Done" }]`
- **WHEN** フロントエンドが rename map を計算する
- **THEN** rename map は `{}`（空）となる
