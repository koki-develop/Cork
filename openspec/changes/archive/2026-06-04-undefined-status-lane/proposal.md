## Why

現在、frontmatter に `status:` が設定された値が `.cork.json` に定義されたステータスのいずれにも一致しないタスクは、board 上に一切表示されずユーザーが存在に気づけない。これはワークフローの外で作成された `.md` ファイルや、削除されたステータスを持つタスクが「見えない」状態になる問題を引き起こす。また、`status:` を持たないファイル（Cork が管理すべきでない `.md` ファイル）がデフォルトステータスを割り当てられて board に混入する問題も同時に解消する。

## What Changes

- **BREAKING**: frontmatter に `status:` キーが存在しない `.md` ファイルは Cork の管理対象外とみなし、`list_tasks` の結果に含めない
- **NEW**: `status:` の値が定義済みステータスのいずれにも一致しないタスクを一覧表示する「Unknown」レーンを board の一番左に追加する
- Unknown レーンには `New Task` ボタンを設置しない
- Unknown レーンは column ドラッグによる並び替え対象外とする（常に左端固定）
- Unknown レーンへの card ドロップは受け付けない（カードを誤って unknown 状態にできない）
- Unknown レーンからの card のドラッグアウトは可能（正しいステータスに移動して修復できる）

## Capabilities

### New Capabilities

- `undefined-status-lane`: board に unknown ステータスのタスクを表示するレーンを提供する。frontmatter `status:` の有無によるフィルタリングと、未定義ステータス値の検出・表示をカバーする。

### Modified Capabilities

- `per-workspace-statuses`: `list_tasks` における frontmatter `status` の扱いを変更する。`status:` キーを持たないファイルを管理対象から除外し、デフォルトステータス割り当ての仕様を廃止する。また、未定義ステータス値を持つタスクでも board 上で可視化されるよう要件を変更する。

## Impact

- **Rust backend** (`src-tauri/src/lib.rs`): `Frontmatter.status` の型を `Option<String>` に変更し、`parse_frontmatter` で `status:` の有無を識別可能にする。`list_tasks` で `status:` のないファイルをスキップする。未定義ステータス値のタスクをそのままのラベルで含める。
- **Frontend lib** (`src/lib/board.ts`): `groupTasksByStatus` を拡張し、定義済みステータスにマッチしないタスクを `__unknown__` グループに集約する。
- **Frontend hook** (`src/hooks/useBoardDragState.ts`): `__unknown__` カラムを `columnOrder` の先頭に追加する。unknown カラムへの card ドロップを無視する（status 更新を発行しない）。
- **Frontend component** (`src/components/organisms/board/KanbanColumn.tsx`): `disableNewTask` prop を追加し、Unknown レーンでは `New Task` ボタンを隠す。`disableDrag` prop を追加し、Unknown レーンを column ドラッグ不可にする。
- **Frontend page** (`src/components/pages/BoardPage.tsx`): Unknown レーンを `KanbanColumn` として先頭にレンダリングする。
