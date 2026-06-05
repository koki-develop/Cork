## Context

Cork のカンバンボードは現在 `@hello-pangea/dnd` を使用してカードのドラッグ&ドロップを実現している。`@hello-pangea/dnd` は `react-beautiful-dnd` のフォークだが、React 19 / TypeScript 5.8 環境でのメンテナンス継続性に懸念がある。

`@dnd-kit` はメンテナンスが活発で、v0.4.0 が 2026年4月にリリースされている。アーキテクチャは `@dnd-kit/abstract` → `@dnd-kit/dom` → `@dnd-kit/react` の3層構造で、React アダプターは thin wrapper として設計されている。同じ作者（clauderic）がメンテナンスしており、17.2k stars の成熟したプロジェクト。

現在のアーキテクチャ:

- `Board.tsx` → `DragDropContext` (from `@hello-pangea/dnd`)
- `Column.tsx` → `<Droppable droppableId={title}>` render-prop
- `Card.tsx` → `<Draggable draggableId={task.id} index={index}>` render-prop, カード全体が drag handle
- `useWorkspace.ts` → `updateTaskStatus` で楽観的更新 + invoke

移行先の API:

- `Board.tsx` → `<DragDropProvider>` (from `@dnd-kit/react`)
- `Column.tsx` → `useDroppable` hook
- `Card.tsx` → `useDraggable` hook, カード全体を drag handle に
- イベント型 → `DragEndEvent` (`event.operation.source.id`, `event.operation.target?.id`)

## Goals / Non-Goals

**Goals:**

- `@hello-pangea/dnd` を `@dnd-kit/react` + `@dnd-kit/helpers` に置き換える
- 既存の全機能（カードのドラッグ、カラム間移動、キーボードアクセシビリティ）を維持する
- カード全体を drag handle とする（GripHorizontal アイコンは削除）
- `onDragEnd` のロジックは現状維持（`source.droppableId` 相当 → `event.operation.source.data.status` などで代替）
- `bun run build`（tsc + vite build）が通る状態にする
- `@dnd-kit/helpers` の `move` 関数は今回は使用しない（intra-column reorder は非サポートのため。将来の拡張に備えて依存関係として追加しておく）

**Non-Goals:**

- カラム内の並び替え（intra-column reorder）の追加 — 非サポートを継続
- 設定画面のステータス並び替えへの DnD 追加
- DragOverlay のカスタム実装（デフォルトのフィードバックで十分）
- 既存の動作の変更

## Decisions

### useDraggable + useDroppable を採用（useSortable は不使用）

`@dnd-kit/react` が提供する3つのフックのうち、`useDraggable` + `useDroppable` の組み合わせを採用する。`useSortable` は intra-column の並び替えを前提とした API であり、Cork は intra-column reorder を非サポートとしているため必要ない。

| アプローチ                      | 判断                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `useDraggable` + `useDroppable` | 採用。シンプルで要件に合致                                 |
| `useSortable`                   | 不採用。intra-column の index 管理が不要なためオーバーキル |

### カード全体を drag handle にする（GripHorizontal アイコンは削除）

`@dnd-kit` の `useDraggable` は `handleRef` を指定しない場合、`ref` を割り当てた要素全体が drag handle として動作する。Cork ではカード全体を掴んでドラッグする UX を採用し、GripHorizontal アイコンは削除する。これにより視覚的なノイズが減り、直感的な操作感が得られる。

### DragOverlay は使用しない

`@dnd-kit` のデフォルトの Feedback プラグインが半透明のゴーストを自動生成する。これは現状の `@hello-pangea/dnd` の動作と同等であるため、`DragOverlay` コンポーネントは追加しない。

### `type` / `accept` による制約を設定

- Card（`useDraggable`）: `type: 'card'`
- Column（`useDroppable`）: `accept: 'card'`
  これによりカードのみがカラムにドロップ可能となり、カード同士の不要な干渉を防ぐ。

## Risks / Trade-offs

| Risk                                                                                                             | Mitigation                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@dnd-kit` v0.4.0 はメジャーバージョンが 0.x で API が安定していない可能性                                       | changelog を監視し、破壊的変更があった場合も迅速に対応可能な設計にする。v0.4.0 は 2026年4月リリースで既に実績あり。                 |
| hooks API（`useDraggable`/`useDroppable`）は render-prop と異なり、各コンポーネント内で ref を管理する必要がある | React 19 の ref callback パターンに適合。現状のコードベースも hooks ベースなので親和性は高い。                                      |
| Tauri webview でのドラッグ動作が `@hello-pangea/dnd` と異なる可能性                                              | `@dnd-kit` は Pointer Events API ベースで、Tauri の webview（システム標準）で標準的に動作する。`bun run tauri dev` で早期検証する。 |
| カード全体が drag handle のため、テキスト選択やカード内クリックがドラッグとして誤認識される可能性                | `@dnd-kit` のデフォルトセンサーは十分な距離判定（activation distance）を持ち、単なるクリックではドラッグが開始されない。            |
