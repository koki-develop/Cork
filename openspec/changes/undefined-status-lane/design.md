## Context

現在の `list_tasks` は frontmatter がパースできた場合は `status` フィールドの値をそのまま使い、パースできなかった場合や `status:` キーが欠落している場合は `.cork.json` の先頭ステータスをデフォルトとして割り当てる。これにより「`status:` を持たないファイル」と「未定義のステータス値を持つファイル」の区別がつかず、すべてが board 上のいずれかの列に割り当てられるか、未定義ステータスのタスクは `groupTasksByStatus` のフィルタによって暗黙的に除外される。

`Frontmatter.status` の型は `#[serde(default)]` により `String` で、`status:` キーの有無を判定できない。

## Goals / Non-Goals

**Goals:**
- `status:` キーを持たない `.md` ファイルを board から完全に除外する
- 定義済みステータス値のいずれにも一致しない `status:` 値を持つタスクを、Unknown レーンに表示する
- Unknown レーンは board の一番左に固定表示し、`New Task` ボタンは設置しない
- Unknown レーンからのカードドラッグアウトは可能（正しいステータスへの修復操作）
- Unknown レーンへのカードドロップは受け付けない

**Non-Goals:**
- Unknown レーンの見た目カスタマイズ（色、アイコン等）は本変更の対象外
- 未定義ステータスを定義済みステータスに変換する一括操作 UI は本変更の対象外
- ファイル監視（watch）ロジックの変更は行わない

## Decisions

### Decision 1: Rust 側で `status:` の有無を判定し、不要なファイルを除外する

**選択**: `Frontmatter.status` の型を `String` から `Option<String>` に変更する。`#[serde(default)]` を外すことで、`status:` キーが frontmatter に存在しない場合は `None`、存在する場合は `Some(label)` としてパースされる。`list_tasks` では `status: None` のファイルをスキップする。

**根拠**: フロントエンドだけでは「status が空文字なのか未定義なのか」を区別できない。バックエンドで確定的に除外することで、一貫性のあるフィルタリングが可能。`serde` の標準機能のみで実現でき、依存関係の追加が不要。

**代替案**: フロントエンドで空文字列やマッチしないステータスをフィルタする。→ 判定が曖昧になり、ファイル一覧APIが常に全ファイルを返すため、ワークスペースに大量の非管理ファイルがあるとパフォーマンスが劣化する。

### Decision 2: 未定義ステータスグループを `__unknown__` センチネル値で表現する

**選択**: `groupTasksByStatus` の戻り値 `Record<string, string[]>` に `__unknown__` キーを追加し、定義済みステータスにマッチしないタスク ID をこのキーに集約する。`useBoardDragState` の `columnOrder` に `__unknown__` を先頭に追加する。

**根拠**: 既存のデータ構造（`tasksByColumn`）を拡張するだけで実現でき、新しいデータフローを導入する必要がない。`BoardPage` でのレンダリングも既存の `KanbanColumn` ループに組み込める。

**代替案**: `undefinedTaskIds: string[]` を別途返す別の戻り値型を導入する。→ `useBoardDragState` の内部処理とレンダリングロジックが複雑化する。センチネル値の方が `move()` 等の dnd-kit ヘルパーとの親和性が高い。

### Decision 3: Unknown レーンは column ドラッグ不可・カードドロップ不可とする

**選択**: `KanbanColumn` に `disableNewTask?: boolean` と `disableDrag?: boolean` の 2 つの props を追加する。Unknown レーンでは `disableDrag={true}` を渡し、`useSortable` を呼ばない／`accept: []` とする。`disableNewTask={true}` で `New Task` ボタンを非表示にする。

Unknown レーンへのカードドロップが試みられた場合、`useBoardDragState.handleDragEnd` で転送先が `__unknown__` なら `updateTaskStatus` をスキップする（カードの表示位置のみ移動せず、API コールも行わない）。

**根拠**: Unknown レーンは「未定義ステータスのタスクを確認する」ための読み取り専用ビューであり、新しいタスクをここで作成したり、カードを誤って unknown 状態に変更する操作を防ぐ必要がある。カードのドラッグアウトは許可することで、ユーザーがタスクを正しいステータスに修復できる。

### Decision 4: `update_task_status` で任意の文字列のステータスを書き込める

**選択**: `update_task_status` のバリデーションは行わず、現状のまま任意の文字列を受け付ける。Unknown レーンからのカードドラッグアウトにより、フロントエンドが定義済みステータス値のみを送信するため、unknown 値が書き込まれることはない。

**根拠**: バックエンドにバリデーションを追加する必要はない。もし外部ツールで直接 `.md` を編集して任意のステータスが設定された場合も、それは Undefined レーンに表示されるべき正当なケースである。

## Risks / Trade-offs

- **[後方互換性]** `status:` キーを持たない既存の `.md` ファイルが board から見えなくなる。→ ユーザーが手動で `status:` を追加する必要がある。この変更は `proposal.md` で **BREAKING** として明記済み。
- **[内部実装の結合]** `__unknown__` センチネル値がフロントエンドの複数モジュール（`board.ts`、`useBoardDragState.ts`、`BoardPage.tsx`）で参照される。→ 定数 `UNKNOWN_STATUS` として `board.ts` に一元定義し、この値を常に参照する。変更時は一箇所のみの修正で済む。
- **[DnD のエッジケース]** Unknown レーンからカードをドラッグ中に、ドロップがキャンセルされた場合、カードは Unknown レーンに戻る。→ dnd-kit の標準動作であり、追加対応不要。
