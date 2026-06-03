## 1. Hook layer

- [x] 1.1 `useStatusEdit` から `handleMoveUp` と `handleMoveDown` を削除する
- [x] 1.2 `useStatusEdit` に `handleReorder(fromKey: string, toKey: string)` を追加する（`editing` 配列を `_key` 一致でローカル並び替えするのみ。`fromKey`/`toKey` が見つからない場合は no-op）
- [x] 1.3 `useStatusEdit` の戻り値オブジェクトを更新し、`handleReorder` を公開、`handleMoveUp` / `handleMoveDown` を取り除く

## 2. StatusRow

- [x] 2.1 `StatusRow` の props から `isFirst`、`isLast`、`onMoveUp`、`onMoveDown` を削除する
- [x] 2.2 `StatusRow` の props に `id: string`（= `_key`）と `index: number` を追加する
- [x] 2.3 `@dnd-kit/react/sortable` の `useSortable` を `StatusRow` 内で利用し、`ref` を行コンテナに、`handleRef` を `GripVertical` アイコンに割り当てる（type は `"status-row"` を使用し Board の `"column"` / `"card"` と衝突しないようにする）
- [x] 2.4 行の左端に `GripVertical`（`cursor-grab active:cursor-grabbing`）を表示する。`Column.tsx:37-40` と同じビジュアル粒度に揃える
- [x] 2.5 既存の `ArrowUp` / `ArrowDown` ボタンとその import を `StatusRow` から削除する
- [x] 2.6 既存のテキスト入力 `<input>` と削除ボタンの挙動・スタイルは変更しないこと

## 3. StatusList

- [x] 3.1 `StatusList` の props から `onMoveUp`、`onMoveDown` を削除し、代わりに `onReorder(fromKey: string, toKey: string)` を追加する
- [x] 3.2 `StatusList` のリスト部分を `@dnd-kit/react` の `DragDropProvider` でラップする
- [x] 3.3 `DragDropProvider` の `onDragEnd` で、`event.operation.source.id` を `fromKey`、`event.operation.target?.id` を `toKey` として `onReorder` を呼ぶ（`canceled` または `target` が無い場合は何もしない）
- [x] 3.4 `editing.map(...)` で `<StatusRow>` を描画する際、`id={s._key}` と `index={i}` を渡す
- [x] 3.5 「Add Status」ボタン（`Plus`）は sortable リストの外（または `DragDropProvider` 内でも sortable に登録しない要素）として描画する

## 4. SettingsPanel

- [x] 4.1 `SettingsPanel` で `useStatusEdit` の戻り値の利用箇所を更新し、`handleMoveUp` / `handleMoveDown` への参照を削除する
- [x] 4.2 `StatusList` に `onReorder={handleReorder}` を渡し、`onMoveUp` / `onMoveDown` の prop を取り除く
- [x] 4.3 Save ボタンの挙動が従来通りであること（`handleSave` 経由で `save_statuses` を呼ぶ）を確認する

## 5. Verification

- [x] 5.1 `bun run build`（`tsc && vite build`）が型エラー無くパスすることを確認する
- [x] 5.2 `bun run format` を実行し Biome の指摘を解消する
- [x] 5.3 `bun run tauri dev` で起動し、設定パネルを開いて以下を手動確認する:
  - [x] 5.3.1 各行に `GripVertical` ハンドルが表示される
  - [x] 5.3.2 ハンドルをドラッグして上下に並び替えできる
  - [x] 5.3.3 ラベル `<input>` 内でテキスト選択・編集ができる（ドラッグに奪われない）
  - [x] 5.3.4 削除ボタンが正常にクリックでき、ドラッグと誤認されない
  - [x] 5.3.5 並び替え後に Cancel すると順序が永続化されない
  - [x] 5.3.6 並び替え後に Save すると永続化され、再オープン時に新しい順序になる
  - [x] 5.3.7 ボード側のカラム/カードのドラッグ&ドロップが従来通り動作する（リグレッション無し）
