# per-workspace-statuses Specification

## Purpose

TBD - created by archiving change per-workspace-statuses. Update Purpose after archive.

## Requirements

### Requirement: statuses 設定は作業ディレクトリ直下の `.cork.json` に保存される

statuses 設定はグローバル `settings.json` ではなく、現在選択中の作業ディレクトリ直下の `.cork.json` ファイルに保存される。`.cork.json` のスキーマは JSON オブジェクト形式で、`statuses` キーに `{ "label": string }` 要素の配列を保持する。Cork は statuses 設定の永続化先として `.cork.json` のみを使用し、他のパスを使用してはならない (MUST)。

#### Scenario: 作業ディレクトリ A と B で独立した statuses 構成を持てる

- **GIVEN** ユーザーが作業ディレクトリ A で `Backlog / Doing / Done` を、作業ディレクトリ B で `Todo / In Progress / Review / Done` を保存している
- **WHEN** ユーザーが Cork を作業ディレクトリ A に切り替える
- **THEN** Board と設定パネルには A の `Backlog / Doing / Done` が表示される
- **AND** B に切り替えると Board と設定パネルには `Todo / In Progress / Review / Done` が表示される

#### Scenario: `.cork.json` のスキーマ

- **WHEN** Cork が statuses を作業ディレクトリに永続化する
- **THEN** 作業ディレクトリ直下に `.cork.json` というファイルが作成され、内容は `{"statuses": [{"label": "..."}, ...]}` 形式の JSON である
- **AND** ファイルは人間が読める 2 スペースインデントの整形 JSON で書かれ、末尾改行を含む

### Requirement: グローバル `settings.json` の `statuses` キーは廃止される

`tauri_plugin_store` 経由のグローバル `settings.json` に `statuses` を読み書きするコードパスは存在してはならない (MUST NOT)。`get_statuses` / `save_statuses` / `list_tasks` のデフォルトステータス読み出しはすべて `.cork.json` ベースに置き換わる (SHALL)。

#### Scenario: グローバル `settings.json` に `statuses` が書き込まれない

- **WHEN** ユーザーが設定パネルで statuses を編集・追加・削除・並び替えする
- **THEN** OS のアプリデータディレクトリにあるグローバル `settings.json` の `statuses` キーは更新されない（存在しないまま）
- **AND** 変更内容は作業ディレクトリの `.cork.json` にのみ書き込まれる

#### Scenario: 既存ユーザーのグローバル `statuses` 設定は無視される

- **GIVEN** 旧バージョンの Cork を使っていたユーザーのグローバル `settings.json` に過去の `statuses` 配列が残っている
- **WHEN** 新バージョンの Cork が起動する
- **THEN** その旧データは読み込まれず、`.cork.json` が存在しなければフロントエンドのデフォルト `Todo / Doing / Done` が表示される

### Requirement: `get_statuses` は作業ディレクトリの `.cork.json` を読み出す

`get_statuses` Tauri コマンドは現在の `AppState.workspace_dir` 配下の `.cork.json` を読み、`statuses` キーの配列を返さなければならない (MUST)。ファイル不在 / JSON パース失敗 / `statuses` キー欠落 / 配列型でない場合 / `workspace_dir` 未設定の場合は、いずれも空配列を返す (SHALL)。

#### Scenario: 正常な `.cork.json` を読み出す

- **GIVEN** 作業ディレクトリ直下に有効な `.cork.json`（`{"statuses": [{"label": "A"}, {"label": "B"}]}`）が存在する
- **WHEN** フロントエンドが `get_statuses` を invoke する
- **THEN** `[{"label": "A"}, {"label": "B"}]` が返る

#### Scenario: `.cork.json` が存在しない

- **GIVEN** 作業ディレクトリ直下に `.cork.json` が存在しない
- **WHEN** フロントエンドが `get_statuses` を invoke する
- **THEN** 空配列 `[]` が返る
- **AND** ファイルは自動生成されない（後続の `save_statuses` でのみ生成される）

#### Scenario: `.cork.json` が JSON パース失敗する

- **GIVEN** 作業ディレクトリ直下の `.cork.json` が JSON として不正である（中括弧の対応が壊れている等）
- **WHEN** フロントエンドが `get_statuses` を invoke する
- **THEN** 空配列 `[]` が返る
- **AND** バックエンドのプロセス標準エラー出力にパース失敗の旨が出力される

#### Scenario: `.cork.json` の `statuses` キーが欠落 / 型不一致

- **GIVEN** `.cork.json` は JSON として valid だが、`statuses` キーが存在しないか、配列以外の値が入っている
- **WHEN** フロントエンドが `get_statuses` を invoke する
- **THEN** 空配列 `[]` が返る

#### Scenario: 作業ディレクトリが未選択

- **GIVEN** `AppState.workspace_dir` が `None`
- **WHEN** フロントエンドが `get_statuses` を invoke する
- **THEN** 空配列 `[]` が返る（エラーにはしない）

### Requirement: `save_statuses` は作業ディレクトリの `.cork.json` に書き込む

`save_statuses` Tauri コマンドは現在の `AppState.workspace_dir` 配下の `.cork.json` に統一フォーマット（`{"statuses": [...]}` + 2 スペースインデント整形 + 末尾改行）で書き込まなければならない (MUST)。`workspace_dir` 未設定時はエラーを返し、ファイルシステムへの副作用を起こしてはならない (MUST NOT)。

#### Scenario: 新規に `.cork.json` を作成する

- **GIVEN** 作業ディレクトリ直下に `.cork.json` がまだ存在しない
- **WHEN** フロントエンドが `save_statuses` に `[{"label": "Todo"}, {"label": "Done"}]` を渡して invoke する
- **THEN** 作業ディレクトリ直下に `.cork.json` が新規作成される
- **AND** 内容は `{"statuses": [{"label": "Todo"}, {"label": "Done"}]}` を 2 スペースインデントで整形した JSON である

#### Scenario: 既存の `.cork.json` を更新する

- **GIVEN** 作業ディレクトリ直下に有効な `.cork.json` が存在する
- **WHEN** フロントエンドが `save_statuses` に新しい配列を渡して invoke する
- **THEN** `.cork.json` の `statuses` キーが新しい配列で完全に上書きされる
- **AND** `.cork.json` 内に存在する `statuses` 以外のキー（将来の拡張用）はそのまま残る

#### Scenario: 作業ディレクトリが未選択での保存

- **GIVEN** `AppState.workspace_dir` が `None`
- **WHEN** フロントエンドが `save_statuses` を invoke する
- **THEN** `Err("No directory selected")` 相当のエラーが返る
- **AND** ファイルシステムに副作用は無い

### Requirement: frontmatter に `status` を持たない `.md` ファイルは `list_tasks` に含めない

frontmatter に `status` キーを持たない `.md` ファイルは Cork の管理対象外とみなし、`list_tasks` の結果に含めてはならない (MUST NOT)。従来の「`.cork.json` の先頭ステータスをデフォルトとして割り当てる」挙動は廃止される。

frontmatter に `status` キーが存在するが、その値が `.cork.json` に定義されたいずれのステータスラベルとも一致しない場合は、タスクはその値を持ったまま `list_tasks` の結果に含めなければならず (MUST)、board 上では Unknown レーン（別途定義）に表示される。

#### Scenario: `status:` なしのファイルが除外される

- **GIVEN** 作業ディレクトリに `---\ntitle: Hello\n---\n` という内容の `hello.md` が存在する（frontmatter はあるが `status:` キーがない）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `hello.md` に対応する要素は含まれない

#### Scenario: frontmatter 自体がないファイルが除外される

- **GIVEN** 作業ディレクトリに frontmatter を持たない `readme.md` が存在する
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `readme.md` に対応する要素は含まれない

#### Scenario: 未定義ステータス値を持つタスクは結果に含まれる

- **GIVEN** `.cork.json` の statuses が `[{"label": "Todo"}, {"label": "Done"}]`
- **AND** 作業ディレクトリに `---\nstatus: Doing\n---\n` の `task.md`（`Doing` は定義済みステータスに存在しない）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `task.md` に対応する要素が含まれる
- **AND** その要素の `status` は `"Doing"` である

### Requirement: `.cork.json` の外部編集は即時 UI に反映される

`useWorkspace` の watch ループは作業ディレクトリ直下の `.cork.json` の変更・作成・削除イベントを検知しなければならず (MUST)、検知時に `loadStatuses` と `loadTasks` の両方を再実行しなければならない (MUST)。

#### Scenario: Cork 外のエディタで `.cork.json` を編集する

- **GIVEN** ユーザーが Cork を開いた状態で、別エディタで作業ディレクトリの `.cork.json` を書き換えて保存する
- **WHEN** ファイル変更イベントが発火する
- **THEN** 設定パネルと Board の statuses 表示は新しい `.cork.json` の内容に追従して更新される
- **AND** デフォルトステータス変更によって所属列が変わるタスクの表示も更新される

#### Scenario: `.cork.json` をエディタで削除する

- **GIVEN** Cork が開いた状態で、ユーザーが `.cork.json` を削除する
- **WHEN** ファイル削除イベントが発火する
- **THEN** Cork は `get_statuses` の応答が空配列になるためフロントエンドの `DEFAULT_STATUSES`（`Todo / Doing / Done`）に戻る

#### Scenario: `.md` ファイル変更時は statuses を再ロードしない

- **GIVEN** Cork が開いた状態で、ユーザーが `.md` ファイルだけを編集する（`.cork.json` には触れない）
- **WHEN** ファイル変更イベントが発火する
- **THEN** `loadTasks` のみが実行され、`loadStatuses` は実行されない

### Requirement: 作業ディレクトリ切替時に対応する `.cork.json` を読み直す

`useWorkspace.dir` が変化した時、Cork は新しいディレクトリの `.cork.json` から statuses を読み直さなければならない (MUST)。ファイル監視ループも新しいディレクトリを対象とした watch に切り替えなければならない (MUST)。

#### Scenario: 設定パネルで別の作業ディレクトリに切り替える

- **GIVEN** ユーザーが作業ディレクトリ A を開いて statuses が `[Backlog, Done]` 表示されている
- **WHEN** 設定パネルからディレクトリ B に切り替える
- **THEN** Cork は B の `.cork.json` を読み直し、Board と設定パネルが B の statuses 構成で再描画される
- **AND** ファイル監視ループも B を対象とした watch に切り替わる
