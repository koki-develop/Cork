## Why

現在 `@hello-pangea/dnd`（`react-beautiful-dnd` のフォーク）をドラッグ&ドロップに使用しているが、同ライブラリはメンテナンスが停滞しており、React 19、TypeScript 5.8、Tauri v2 との互換性を将来にわたって保証できない。`@dnd-kit` はモダンで軽量、メンテナンスが活発な代替であり、アーキテクチャがフレームワーク非依存のコア + DOM レイヤー + React アダプターに整理されており、将来的なメンテナンス性が高い。

## What Changes

- `@hello-pangea/dnd` を削除し、`@dnd-kit/react` + `@dnd-kit/helpers` に置き換える
- `Board.tsx` の `DragDropContext` → `DragDropProvider` に変更
- `Column.tsx` の `<Droppable>` コンポーネント（render-prop） → `useDroppable` フックに変更
- `Card.tsx` の `<Draggable>` コンポーネント（render-prop） → `useDraggable` フックに変更
- ドラッグハンドルを GripHorizontal アイコンに変更（現状はカード全体がドラッグハンドル）
- `onDragEnd` のイベント型を `@hello-pangea/dnd` の `DropResult` から `@dnd-kit/react` の `DragEndEvent` に変更
- キーボードアクセシビリティは `@dnd-kit` のデフォルトセンサー（PointerSensor + KeyboardSensor）に委ねる
- **BREAKING**: `@hello-pangea/dnd` の render-prop API から `@dnd-kit/react` の hooks API への移行

## Capabilities

### New Capabilities

- `dnd-kit-migration`: ドラッグ&ドロップライブラリを `@dnd-kit/react` + `@dnd-kit/helpers` に移行する。カードのドラッグ、カラムへのドロップ、視覚的フィードバック、キーボードアクセシビリティは維持される。

### Modified Capabilities

- なし。既存の spec の要件変更は発生しない。

## Impact

- **依存関係**: `@hello-pangea/dnd` を削除し、`@dnd-kit/react` + `@dnd-kit/helpers` を追加
- **変更されるコンポーネント**:
  - `Board.tsx` — `DragDropContext` → `DragDropProvider`、`onDragEnd` のイベント型・ハンドラ内部ロジック
  - `Column.tsx` — `<Droppable>` → `useDroppable`、`provided.placeholder` の削除
  - `Card.tsx` — `<Draggable>` → `useDraggable`、ドラッグハンドルを GripHorizontal アイコンに分離
- **変更なし**: `useWorkspace.ts`、`App.tsx`、Rust バックエンド、型定義
