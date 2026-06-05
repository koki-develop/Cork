# task-tags Specification

## Purpose

TBD - created by archiving change task-tags. Update Purpose after archive.

## Requirements

### Requirement: タスクは frontmatter `tags` で文字列タグの配列を保持できる

タスクの Markdown ファイルは YAML frontmatter キー `tags` に文字列の配列を保持できる (SHALL)。`tags` が未定義 / `null` / 空配列の場合、システムはタスクを「タグ無し」状態として扱わなければならない (MUST)。

#### Scenario: 標準的なタグ配列をパースして読み出せる

- **GIVEN** ワークスペース直下の `task-a.md` の frontmatter に `tags: ["bug", "frontend"]` が記述されている
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 当該タスクの `Task.tags` は `["bug", "frontend"]` で返る

#### Scenario: `tags` キー欠落は空配列として扱われる

- **GIVEN** タスクの frontmatter に `tags` キーが存在しない
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** `Task.tags` は `[]` (空配列) として返る
- **AND** フロントエンドは「タグ無しタスク」として扱う (カードのタグ列が非表示になる)

#### Scenario: `tags: null` は空配列として扱われる

- **GIVEN** タスクの frontmatter に `tags: null` が記述されている
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** `Task.tags` は `[]` (空配列) として返る
- **AND** ファイル読み取りは失敗しない

#### Scenario: タグ配列の順序が保持される

- **GIVEN** タスクの frontmatter に `tags: ["zeta", "alpha", "beta"]` が記述されている
- **WHEN** フロントエンドが `list_tasks` または `get_task` を invoke する
- **THEN** `Task.tags` は元のファイル記述順 `["zeta", "alpha", "beta"]` を保つ
- **AND** アルファベット順などにソートされない

#### Scenario: 不正な型の `tags` 値は空配列にフォールバックする

- **GIVEN** タスクの frontmatter に `tags: "bug"` (文字列単体) が記述されている
- **WHEN** `list_tasks` または `get_task` が当該タスクを返す
- **THEN** 当該タスクの `Task.tags` は `[]` (空配列) として返る
- **AND** タスク自体は無視されず、他フィールド (title / status / body) は通常通り読み出される

### Requirement: `create_task` コマンドはタグ配列を受け取って frontmatter に書き出す

`create_task` Tauri コマンドは、オプションパラメータ `tags: Option<Vec<String>>` を受け付けなければならない (MUST)。`Some(_)` で非空配列が渡された場合、frontmatter キー `tags` に書き出さなければならない (MUST)。`None` または空配列の場合、frontmatter に `tags` キーを出力してはならない (MUST NOT)。

#### Scenario: タグ付きでタスクを作成する

- **WHEN** `create_task` が `title="Implement search"`, `status="Doing"`, `tags=Some(vec!["feature", "search"])` で呼ばれる
- **THEN** 新規 `.md` ファイルが作成され、その frontmatter に `tags:` キーと `["feature", "search"]` が含まれる
- **AND** 戻り値の `Task.tags` も `["feature", "search"]` である

#### Scenario: タグ未指定でタスクを作成する

- **WHEN** `create_task` が `tags=None` で呼ばれる
- **THEN** 新規ファイルの frontmatter に `tags:` キーは含まれない
- **AND** 戻り値の `Task.tags` は `[]` (空配列) である

#### Scenario: タグに空配列を明示してタスクを作成する

- **WHEN** `create_task` が `tags=Some(vec![])` で呼ばれる
- **THEN** 新規ファイルの frontmatter に `tags:` キーは含まれない (`tags: []` の行は出力されない)
- **AND** 戻り値の `Task.tags` は `[]` である

### Requirement: 表示専用の `TagList` molecule がカード上にタグを表示する

ボードの `KanbanCard` は、タスクのタグを `TagList` molecule で「タイトル直下・本文プレビューより上」に表示しなければならない (MUST)。`TagList` は読み取り専用とし、編集 UI を持ってはならない (MUST NOT)。タグが 4 個以上の場合、`TagList` は最初の 3 個と `+N` overflow チップのみを表示しなければならない (SHALL)。

#### Scenario: タグが 1〜3 個のときは全て表示される

- **GIVEN** タスクが `tags=["bug", "frontend"]` を持つ
- **WHEN** ボードに当該タスクのカードが描画される
- **THEN** カード上に "bug" "frontend" の 2 つのチップが表示される
- **AND** "+N" overflow チップは表示されない

#### Scenario: タグが 4 個以上のときは最初の 3 個 + overflow チップで表示される

- **GIVEN** タスクが `tags=["a", "b", "c", "d", "e"]` を持つ
- **WHEN** ボードに当該タスクのカードが描画される
- **THEN** カード上に "a" "b" "c" の 3 つのチップに加えて "+2" の overflow チップが表示される
- **AND** "d" "e" の文字列はカード上に描画されない

#### Scenario: タグが空のときは要素自体が描画されない

- **GIVEN** タスクが `tags=[]` を持つ
- **WHEN** ボードに当該タスクのカードが描画される
- **THEN** タグチップ用のコンテナ要素は DOM に挿入されない
- **AND** タイトルと本文プレビューの間に余分な空間が発生しない

#### Scenario: タグはタイトル直下・本文プレビューの上に表示される

- **GIVEN** タスクが `tags=["bug"]` と非空の `body` を持つ
- **WHEN** ボードに当該タスクのカードが描画される
- **THEN** カード内の表示順は タイトル → タグ → 本文プレビュー である
- **AND** タグチップはタイトル直下にレイアウトされ、本文プレビュー下には描画されない

#### Scenario: カード上のタグチップはアクセント系の控えめなトーンを使う

- **WHEN** `KanbanCard` 上で `TagList` 経由のタグチップが描画される (`variant` 未指定 = デフォルト `"muted"`)
- **THEN** チップは `rounded-full` 形状の小型ピル要素である
- **AND** 背景は `bg-cork-accent/10`、枠線は `border-cork-accent/25`、テキスト色は `text-cork-accent-hover/80`、フォントサイズは `text-xs` (12px) (詳細ダイアログのアクセントチップと**同じ色相 (cork-accent)** を使い、不透明度を下げることで控えめに見せる)
- **AND** チップ内のテキストは `truncate` で長すぎる場合に省略される
- **AND** カードのタイトル / 本文プレビューより視覚的に優先度は低いが、灰系の muted トーンではなくアクセント色相を保持する

### Requirement: 編集可能な `TagEditor` molecule が詳細ダイアログでタグを編集できる

`TaskDetailDialog` はタグ編集のため `TagEditor` molecule を 1 つ持たなければならない (MUST)。`TagEditor` は controlled component とし、`tags: string[]` と `onChange(next: string[])` をプロップで受け取り、タグの追加・削除のたびに `onChange` を呼ばなければならない (MUST)。

#### Scenario: チップ表示と末尾入力欄が並ぶ

- **WHEN** `TaskDetailDialog` が開き、タスクが `tags=["bug", "ui"]` を持つ
- **THEN** "Tags" ラベルの下に "bug" "ui" のチップ 2 つが並び、その右端に空の `<input>` が表示される
- **AND** 入力欄の placeholder は "Add tag" / "Add tag…" などタグ追加を示唆するテキストである

#### Scenario: Enter キーで入力中の文字列がチップ化される

- **GIVEN** `TagEditor` の入力欄に "performance" と入力されている
- **WHEN** ユーザが Enter キーを押す
- **THEN** "performance" が新しいチップとして既存チップ列の末尾に追加される
- **AND** 入力欄の値はクリアされ、フォーカスは入力欄に残る
- **AND** `onChange` コールバックが新しい配列で呼ばれる

#### Scenario: カンマキーで入力中の文字列がチップ化される

- **GIVEN** `TagEditor` の入力欄に "p0" と入力されている
- **WHEN** ユーザがカンマ (`,`) キーを押す
- **THEN** "p0" が新しいチップとして追加される
- **AND** 入力欄の値はクリアされる
- **AND** カンマ文字は入力欄に残らない

#### Scenario: 入力欄からフォーカスが外れたときに非空の値はチップ化される

- **GIVEN** `TagEditor` の入力欄に "review" と入力されている
- **WHEN** ユーザが Tab キーまたはマウスで他フィールドにフォーカスを移す
- **THEN** "review" が新しいチップとして追加される

#### Scenario: 空入力欄での Backspace で最後のチップが削除される

- **GIVEN** `TagEditor` の入力欄が空で、チップ列が `["bug", "ui"]`
- **WHEN** ユーザが Backspace キーを押す
- **THEN** "ui" のチップが削除され、チップ列は `["bug"]` になる
- **AND** `onChange` コールバックが新しい配列で呼ばれる
- **AND** 確認モーダルは表示されない

#### Scenario: 入力欄に文字が残っているときの Backspace は通常の削除のみ実行する

- **GIVEN** `TagEditor` の入力欄に "perf" と入力されている
- **WHEN** ユーザが Backspace キーを押す
- **THEN** 入力欄の文字列が "per" に短くなる
- **AND** 末尾のチップは削除されない

#### Scenario: チップの × ボタンクリックで個別削除できる

- **WHEN** ユーザがあるタグチップの × アイコンボタンをクリックする
- **THEN** 当該チップが削除される
- **AND** その他のチップの順序は維持される
- **AND** × アイコンは `lucide-react` の `X` アイコンで描画される
- **AND** × ボタンには `aria-label="Remove tag {tag}"` 形式の aria 属性が付く

#### Scenario: 前後の空白は trim される

- **GIVEN** `TagEditor` の入力欄に " bug " と入力されている
- **WHEN** ユーザが Enter / カンマ / blur のいずれかでチップ化を実行する
- **THEN** チップは "bug" として追加される (前後空白なし)

#### Scenario: 空文字 (空白のみ含む) は無視される

- **GIVEN** `TagEditor` の入力欄が空、または空白のみ
- **WHEN** ユーザが Enter / カンマ / blur のいずれかでチップ化を試みる
- **THEN** 新しいチップは追加されない
- **AND** `onChange` コールバックは呼ばれない

#### Scenario: 既存タグと完全一致する重複は silent ignore される

- **GIVEN** チップ列が `["bug"]` で、`TagEditor` の入力欄に "bug" と入力されている
- **WHEN** ユーザが Enter キーを押す
- **THEN** 新しいチップは追加されず、チップ列は `["bug"]` のまま
- **AND** 入力欄の値はクリアされる (受け付けたが消えた挙動)
- **AND** トーストやエラーメッセージは表示されない

#### Scenario: IME 変換確定の Enter は無視される

- **GIVEN** `TagEditor` の入力欄で日本語 IME により変換中の Enter
- **WHEN** イベントの `isComposing` フラグが `true` の状態で Enter が発火する
- **THEN** 新しいチップは追加されない
- **AND** 入力欄の値は IME 確定後の文字列として保持される

### Requirement: 新規作成ダイアログでタグを入力してタスクを作成できる

`CreateTaskDialog` はタグ入力のため `TagEditor` molecule を 1 つ含まなければならない (MUST)。送信時、未確定の入力欄値を flush したうえで `tags: string[]` を作成リクエストに含めなければならない (MUST)。

#### Scenario: Tags フィールドが Status と Body の間に並ぶ

- **WHEN** `CreateTaskDialog` が開く
- **THEN** ダイアログは Title / Status / Tags / Body の順でフィールドを表示する
- **AND** Tags ラベル (`Text variant="label" size="xs"`) の下に `TagEditor` が描画される

#### Scenario: 初期表示ではタグは空でチップが無い

- **WHEN** `CreateTaskDialog` が新規に開く
- **THEN** Tags フィールドにはチップが 1 つも表示されない
- **AND** 末尾入力欄のみが表示される

#### Scenario: 入力したタグが Create で `onCreateTask` に渡される

- **GIVEN** ダイアログが開き、ユーザが Title / Status を設定済み
- **AND** Tags フィールドで "bug" / "p0" の 2 つのチップを追加した
- **WHEN** ユーザが Create ボタンをクリックする
- **THEN** ダイアログは `onCreateTask(title, status, body, ["bug", "p0"])` を呼ぶ
- **AND** `createTask` API ラッパー経由で Tauri コマンド `create_task` に `tags=["bug", "p0"]` が渡る

#### Scenario: Submit 時に入力欄の未確定文字列が flush される

- **GIVEN** ダイアログの Tags 入力欄に未確定の "ui" が入っている
- **AND** チップ列はまだ空
- **WHEN** ユーザが Create ボタンをクリックする
- **THEN** "ui" が新しいタグとして確定される
- **AND** `onCreateTask` には `tags=["ui"]` が渡される

#### Scenario: タグを 1 つも追加せずに作成できる

- **WHEN** ユーザがタグを 1 つも入力せずに Create をクリックする
- **THEN** `onCreateTask` は空配列 `tags=[]` で呼ばれる
- **AND** 作成されたタスクの frontmatter には `tags` キーが含まれない

#### Scenario: ダイアログを開き直したときタグはリセットされる

- **GIVEN** ユーザがダイアログを開いてタグを追加し、Cancel で閉じた
- **WHEN** 同じユーザが再度 `CreateTaskDialog` を開く
- **THEN** Tags フィールドのチップ列は空状態に戻っている
- **AND** 入力欄も空である
