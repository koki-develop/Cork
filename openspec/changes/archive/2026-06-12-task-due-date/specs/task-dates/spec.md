## ADDED Requirements

### Requirement: タスクは frontmatter `date` で単一の期日を保持できる

タスクの Markdown ファイルは YAML frontmatter キー `date` に `YYYY-MM-DD` 形式（時刻なし、ゼロ埋めの月日）の文字列で単一の期日を保持できる (SHALL)。`date` が未定義 / `null` / 空文字 / 正準形 `YYYY-MM-DD` 以外の値の場合、システムは当該タスクを「期日なし」状態として扱わなければならない (MUST)。

#### Scenario: 正準形の日付をパースして読み出せる

- **GIVEN** ワークスペース直下の `task-a.md` の frontmatter に `date: 2026-06-15` が記述されている
- **WHEN** フロントエンドが `list_tasks` または `get_task` を invoke する
- **THEN** 当該タスクの `Task.date` は文字列 `"2026-06-15"` で返る

#### Scenario: `date` キー欠落は期日なしとして扱われる

- **GIVEN** タスクの frontmatter に `date` キーが存在しない
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** `Task.date` は `null` として返る
- **AND** フロントエンドは「期日なしタスク」として扱う（カードの期日バッジが非表示になる）

#### Scenario: `date: null` は期日なしとして扱われる

- **GIVEN** タスクの frontmatter に `date: null` が記述されている
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** `Task.date` は `null` として返る
- **AND** ファイル読み取りは失敗しない

#### Scenario: 正準形でない日付値は期日なしにフォールバックする

- **GIVEN** タスクの frontmatter に `date: 2026/6/5`（スラッシュ区切り・非ゼロ埋め）が記述されている
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** 当該タスクの `Task.date` は `null` として返る
- **AND** タスク自体は無視されず、他フィールド（title / status / body / tags）は通常通り読み出される

#### Scenario: 日付の serialize / parse がラウンドトリップする

- **GIVEN** アプリ経由で `date` に `"2026-06-15"` が書き込まれる
- **WHEN** 当該ファイルを再度パースする
- **THEN** `Task.date` は文字列 `"2026-06-15"` に戻る
- **AND** YAML の date 型や数値ではなく、文字列として安定的に往復する

### Requirement: `create_task` コマンドは期日を受け取って frontmatter に書き出す

`create_task` Tauri コマンドは、オプションパラメータ `date: Option<String>` を受け付けなければならない (MUST)。`Some(_)` で正準形 `YYYY-MM-DD` が渡された場合、frontmatter キー `date` に書き出さなければならない (MUST)。`None` または空文字の場合、frontmatter に `date` キーを出力してはならない (MUST NOT)。

#### Scenario: 期日付きでタスクを作成する

- **WHEN** `create_task` が `title="Ship release"`, `status="Doing"`, `date=Some("2026-06-20")` で呼ばれる
- **THEN** 新規 `.md` ファイルが作成され、その frontmatter に `date: 2026-06-20` が含まれる
- **AND** 戻り値の `Task.date` も `"2026-06-20"` である

#### Scenario: 期日未指定でタスクを作成する

- **WHEN** `create_task` が `date=None` で呼ばれる
- **THEN** 新規ファイルの frontmatter に `date:` キーは含まれない
- **AND** 戻り値の `Task.date` は `null` である

### Requirement: `update_task` コマンドは期日を Keep / Set / Clear の 3 状態で更新する

`update_task` Tauri コマンドは、オプションパラメータ `date: Option<String>` を受け付けなければならない (MUST)。値は `tags` と同一のセマンティクスで解釈される:

- `None`（未指定）: 既存の `date` を維持する (Keep)。
- `Some("")`（空文字）: frontmatter の `date` キーを物理削除する (Clear)。
- `Some(canonical)`（正準形 `YYYY-MM-DD`）: frontmatter の `date` を当該値に設定する (Set)。

frontmatter の他フィールド（status / order / tags / body）および body は、`date` の更新によって変化してはならない (MUST NOT)。

#### Scenario: 期日を新規設定する

- **GIVEN** `date` キーを持たないタスク
- **WHEN** `update_task` が `date=Some("2026-07-01")` で呼ばれる
- **THEN** frontmatter に `date: 2026-07-01` が追加される
- **AND** 戻り値の `Task.date` は `"2026-07-01"`

#### Scenario: 期日を別の日付に変更する

- **GIVEN** `date: 2026-06-15` を持つタスク
- **WHEN** `update_task` が `date=Some("2026-06-20")` で呼ばれる
- **THEN** frontmatter の `date` が `2026-06-20` に更新される

#### Scenario: 期日をクリアする

- **GIVEN** `date: 2026-06-15` を持つタスク
- **WHEN** `update_task` が `date=Some("")` で呼ばれる
- **THEN** frontmatter から `date` キーが削除される
- **AND** 戻り値の `Task.date` は `null`
- **AND** status / tags / order / body は変化しない

#### Scenario: 期日を維持する（未指定）

- **GIVEN** `date: 2026-06-15` を持つタスク
- **WHEN** `update_task` が `date=None`（他フィールドのみ変更）で呼ばれる
- **THEN** frontmatter の `date` は `2026-06-15` のまま維持される

### Requirement: ダイアログは期日入力欄とカレンダーポップオーバーを提供する

タスク作成ダイアログおよびタスク詳細ダイアログは、サイドバーに「Date」フィールドを持たなければならない (MUST)。当該フィールドはテキスト入力欄を持ち、フォーカス時にカレンダーをポップオーバーとして表示する (SHALL)。ユーザーはカレンダーからの日付選択、`YYYY-MM-DD` の直接入力、設定済み期日のクリアのいずれも行える (SHALL)。

#### Scenario: 入力欄フォーカスでカレンダーが開く

- **WHEN** ユーザーが「Date」フィールドの入力欄にフォーカスする
- **THEN** カレンダーがポップオーバーとして表示される
- **AND** ポップオーバーはモーダルダイアログの背景より前面に表示される

#### Scenario: カレンダーから日付を選択する

- **WHEN** ユーザーがカレンダー上の日をクリックする
- **THEN** 入力欄に選択日が `YYYY-MM-DD` 形式で反映される
- **AND** ポップオーバーが閉じる

#### Scenario: 期日を直接入力する

- **WHEN** ユーザーが入力欄に `2026-06-20` と直接入力して確定する
- **THEN** 当該日付が期日として受理される
- **AND** カレンダーの選択状態も同じ日付を示す

#### Scenario: 不正な入力は受理されない

- **WHEN** ユーザーが入力欄に `2026-13-40` や `abc` のような不正値を入力して確定する
- **THEN** 当該値は期日として受理されない
- **AND** フィールドは直前の有効値（または未設定）に戻る

#### Scenario: 期日をクリアする

- **GIVEN** 期日が設定済みのフィールド
- **WHEN** ユーザーがクリア操作（× ボタン等）を行う
- **THEN** 期日が未設定になる
- **AND** 詳細ダイアログでは `update_task` が `date=""`（Clear）で auto-save される

#### Scenario: 詳細ダイアログでの期日変更が auto-save される

- **GIVEN** タスク詳細ダイアログが開いている
- **WHEN** ユーザーが期日を変更する
- **THEN** `tags` / `status` と同様に変更が即座に `update_task` で保存される

### Requirement: Kanban カードは期日を相対表示する

Kanban ボードのカードは、期日が設定されたタスクに対して、今日からの相対距離に応じたラベルと色で期日バッジを表示しなければならない (MUST)。期日が未設定のタスクには期日バッジを表示してはならない (MUST NOT)。相対距離 `diff`（= 期日 − 今日、ローカルカレンダー日単位）に基づくカテゴリ・ラベル・色は以下に従う:

| カテゴリ | 条件             | ラベル                | 色              |
| -------- | ---------------- | --------------------- | --------------- |
| overdue  | `diff < 0`       | 実日付（例 `Jun 5`）  | danger 赤       |
| today    | `diff == 0`      | `Today`               | 緑              |
| tomorrow | `diff == 1`      | `Tomorrow`            | オレンジ        |
| soon     | `2 <= diff <= 6` | 曜日名（例 `Monday`） | 紫（accent 系） |
| far      | `diff >= 7`      | 実日付（例 `Jun 20`） | muted           |

曜日名表示は `diff <= 6` までに限定する。`diff == 7` 以降は今日と同じ曜日名になり曖昧なため far として実日付を表示する。

#### Scenario: 今日が期日のカード

- **GIVEN** 期日が今日のタスク
- **WHEN** カードが描画される
- **THEN** バッジに `Today` が緑で表示される

#### Scenario: 明日が期日のカード

- **GIVEN** 期日が明日のタスク
- **WHEN** カードが描画される
- **THEN** バッジに `Tomorrow` がオレンジで表示される

#### Scenario: 数日以内の期日のカード

- **GIVEN** 期日が今日から 3 日後（例: 月曜）のタスク
- **WHEN** カードが描画される
- **THEN** バッジに曜日名（例 `Monday`）が紫系で表示される

#### Scenario: 期日超過のカード

- **GIVEN** 期日が過去のタスク
- **WHEN** カードが描画される
- **THEN** バッジに実日付が danger 赤で表示される

#### Scenario: 遠い未来の期日のカード

- **GIVEN** 期日が今日から 7 日以上後のタスク
- **WHEN** カードが描画される
- **THEN** バッジに実日付（例 `Jun 20`）が muted で表示される

#### Scenario: 別の暦年の期日は年も表示する

- **GIVEN** 期日が今日と異なる暦年（過去・未来いずれも）のタスク
- **WHEN** カードが描画される
- **THEN** バッジの実日付に年が付与される（例 今日が 2026 年で期日 2027-01-05 → `Jan 5, 2027`）
- **AND** 今日と同じ暦年の実日付には年が付かない（例 `Jun 20`）

#### Scenario: 期日なしのカード

- **GIVEN** 期日が未設定のタスク
- **WHEN** カードが描画される
- **THEN** 期日バッジは表示されない
