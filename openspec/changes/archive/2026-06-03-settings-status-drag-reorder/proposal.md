## Why

設定画面のステータス並び替えは現在、各行に表示された上下矢印ボタン（`ArrowUp` / `ArrowDown`）で 1 段ずつ移動させる方式になっており、複数項目を大きく移動させたい場合に何度もクリックする必要があって煩雑。一方、ボード画面ではカラム・カードともに `@dnd-kit/react` でドラッグ&ドロップ並び替えを提供しており、UI の一貫性も損なわれている。設定画面でも同じ DnD ライブラリを使ったドラッグ並び替えへ統一することで操作コストと認知負荷を下げる。

## What Changes

- 設定画面の `StatusRow` から上下矢印ボタン（`ArrowUp` / `ArrowDown`）を削除する
- 各行の左端にドラッグハンドル（`GripVertical`）を表示し、行をドラッグで縦方向に並び替えられるようにする
- `StatusList` を `@dnd-kit/react` の `DragDropProvider` でラップし、各 `StatusRow` を `useSortable` でソート可能にする（`EditingEntry._key` を ID として使用）
- 並び替え結果は、これまで通り Save ボタン押下時にのみ `save_statuses` で永続化される（DnD 操作中はローカル状態のみ更新）
- **BREAKING**: `useStatusEdit` の `handleMoveUp` / `handleMoveDown` を削除し、代わりに `handleReorder(fromKey, toKey)` を追加する（ボタン呼び出し元が同時に削除されるためアプリ内に影響なし）

## Capabilities

### New Capabilities

- `settings-status-drag-reorder`: 設定画面でステータス行をドラッグ&ドロップで並び替える機能。ハンドル経由のドラッグ、視覚的フィードバック、Save ボタンでの永続化、テキスト編集との共存を扱う。

### Modified Capabilities

なし — `openspec/specs/` に既存 spec は存在しない。

## Impact

- **`src/components/settings/StatusList.tsx`**: `DragDropProvider` を導入。`handleDragEnd` で `_key` ベースの並び替えを行い親に通知。
- **`src/components/settings/StatusRow.tsx`**: `useSortable` を導入。`GripVertical` ハンドルを左端に追加し、`ArrowUp` / `ArrowDown` ボタンと関連 props (`isFirst`, `isLast`, `onMoveUp`, `onMoveDown`) を削除。
- **`src/components/settings/SettingsPanel.tsx`**: `handleMoveUp` / `handleMoveDown` の受け渡しを削除し、代わりに `handleReorder` を渡す。
- **`src/hooks/useStatusEdit.ts`**: `handleMoveUp` / `handleMoveDown` を削除し、`handleReorder(fromKey, toKey)` を追加。
- **依存関係**: 新規追加なし。既存の `@dnd-kit/react` v0.4.0 と `@dnd-kit/helpers` v0.4.0 を流用。
- **Rust バックエンド**: 変更なし（`save_statuses` は順序付き `Vec<StatusEntry>` をそのまま受け取るため）。
- **型定義**: 変更なし。`EditingEntry._key` を DnD の sortable id として再利用する。
