# undefined-status-lane Specification

## Purpose

board 上で未定義のステータス値を持つタスクを表示する Unknown レーンを提供する。frontmatter `status:` の有無によるフィルタリングと、未定義ステータス値の検出・表示をカバーする。

## Requirements

### Requirement: frontmatter に `status:` キーを持たない `.md` ファイルは board に表示されない

`list_tasks` は frontmatter をパースした結果、`status` フィールドが存在しない（`None`）ファイルを結果から除外しなければならない (MUST)。デフォルトステータスの割り当ては行わない (MUST NOT)。

#### Scenario: `status:` なしのファイルが除外される

- **GIVEN** 作業ディレクトリに `---\ntitle: Hello\n---\n` という内容の `hello.md` が存在する（frontmatter はあるが `status:` キーがない）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `hello.md` に対応する要素は含まれない

#### Scenario: frontmatter 自体がないファイルが除外される

- **GIVEN** 作業ディレクトリに frontmatter を持たない `readme.md` が存在する
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `readme.md` に対応する要素は含まれない

#### Scenario: `status:` キーが空で `status: ` と書かれたファイルは除外される

- **GIVEN** 作業ディレクトリに `---\nstatus: \n---\n` という内容の `empty.md` が存在する（`status:` の値が空）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `empty.md` に対応する要素は含まれない

### Requirement: 未定義ステータスを持つタスクは Unknown レーンに表示される

frontmatter の `status` 値が `.cork.json` に定義されたいずれのステータスラベルとも一致しないタスクは、Unknown レーンに集約されなければならない (MUST)。Unknown レーンは board の一番左（他の全レーンの左側）に位置しなければならない (MUST)。

#### Scenario: 削除されたステータスを持つタスクが Unknown レーンに表示される

- **GIVEN** `.cork.json` の statuses が `[{"label": "Todo"}, {"label": "Done"}]`
- **AND** `task.md` の frontmatter に `status: Doing` と設定されている（`Doing` は定義済みステータスに存在しない）
- **WHEN** board が表示される
- **THEN** `task.md` に対応するカードが Unknown レーンに表示される

#### Scenario: 外部ツールで作られた未知のステータスも Unknown レーンに表示される

- **GIVEN** `.cork.json` の statuses が `[{"label": "Todo"}, {"label": "Done"}]`
- **AND** `project.md` の frontmatter に `status: Backlog` と設定されている（`Backlog` は定義済みステータスに存在しない）
- **WHEN** board が表示される
- **THEN** `project.md` に対応するカードが Unknown レーンに表示される

### Requirement: Unknown レーンは `New Task` ボタンを持たない

Unknown レーンは他のレーンと異なり、タスク作成のための `New Task` ボタンを表示してはならない (MUST NOT)。

#### Scenario: Unknown レーンに New Task ボタンが表示されない

- **GIVEN** Unknown レーンが board に表示されている
- **WHEN** ユーザーが Unknown レーンを見る
- **THEN** `New Task` ボタンは存在しない

### Requirement: Unknown レーンは column ドラッグによる並び替え対象外

Unknown レーンは常に board の一番左に固定され、ドラッグによる column の並び替え操作の対象になってはならない (MUST NOT)。

#### Scenario: Unknown レーンをドラッグできない

- **GIVEN** board に Unknown レーンが表示されている
- **WHEN** ユーザーが Unknown レーンのヘッダー領域をドラッグしようとする
- **THEN** ドラッグ操作は開始されず、レーンは移動しない

### Requirement: Unknown レーンへの card ドロップは無視される

ユーザーが他のレーンのカードを Unknown レーンにドロップしても、そのカードのステータスは変更されない (MUST NOT)。Unknown レーンからのカードドラッグアウトは許可され、正しいステータスへの移動が可能でなければならない (MUST)。

#### Scenario: カードを Unknown レーンにドロップしてもステータスが変わらない

- **GIVEN** board に Unknown レーンと `Todo` レーンが表示されている
- **AND** `Todo` レーンのカードを Unknown レーンにドラッグする
- **WHEN** ユーザーがカードを Unknown レーンにドロップする
- **THEN** カードは元の `Todo` レーンに留まる
- **AND** カードの frontmatter `status` は更新されない

#### Scenario: Unknown レーンから Todo レーンへカードを移動できる

- **GIVEN** board の Unknown レーンに `status: UnknownStatus` のカードが表示されている
- **WHEN** ユーザーがそのカードを `Todo` レーンにドラッグ＆ドロップする
- **THEN** カードの frontmatter `status` が `Todo` に更新される
- **AND** カードが `Todo` レーンに表示される
- **AND** カードが Unknown レーンから消える
