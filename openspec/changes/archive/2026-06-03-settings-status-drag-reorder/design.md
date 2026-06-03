## Context

設定パネル（`SettingsPanel.tsx` → `StatusList.tsx` → `StatusRow.tsx`）では、各ステータス行に `ArrowUp` / `ArrowDown` ボタンを置き、`useStatusEdit.handleMoveUp` / `handleMoveDown` がローカル `editing: EditingEntry[]` を index ベースで swap する実装になっている。永続化は Save ボタン押下時の `invoke("save_statuses", ...)` のみ。

ボード（`Board.tsx`、`Column.tsx`、`Card.tsx`、`useBoardDragState.ts`）はすでに `@dnd-kit/react` v0.4.0 + `@dnd-kit/helpers` v0.4.0 を採用しており、`DragDropProvider` + `useSortable` + `move()` ヘルパーで縦横どちらの並び替えにも対応している。設定画面では新規依存を入れずにこのスタックを再利用するのが自然。

設定画面はモーダル内のフォーム要素（テキスト入力・削除ボタン・追加ボタン・キャンセル/保存）と共存する点が、ボードのカラムドラッグとは違う制約になる。`<input>` 内のテキスト選択・編集や `Backspace`/矢印キー入力を、DnD のキーボードセンサーや pointer ハンドリングが奪わないこと、削除ボタンの click イベントがドラッグ開始と取り違えられないことが必須要件になる。

`EditingEntry` には UUID の `_key` がすでに付与されている（`useStatusEdit.ts:8, 21`）。これは React の key としての利用が主目的だが、空ラベル・重複ラベルも許容するため `label` を sortable id に流用するのは不適切で、`_key` をそのまま DnD の `id` に使うのが安全。

## Goals / Non-Goals

**Goals:**
- 設定パネルでステータス行をマウス/タッチドラッグで縦方向に並び替えられる
- 既存のボードと同じ `@dnd-kit/react` スタック・同じビジュアルコンセプト（`GripVertical` ハンドル）で UI を一貫させる
- テキスト入力欄での編集体験を一切壊さない（カーソル移動・テキスト選択・Backspace 等）
- 並び替え結果は従来通り「Save ボタン押下時のみ永続化」というセマンティクスを維持する
- 永続化・状態管理レイヤー（`save_statuses`、`StatusEntry` 型、`useWorkspace`）には触れない

**Non-Goals:**
- 設定画面の他の項目（ワークスペースディレクトリ変更、ラベル編集、削除、追加）への変更
- ステータスの「ボード列」自体のドラッグ並び替えロジック変更（`column-drag-reorder` 側の挙動は不変）
- アクセシビリティ（キーボード並び替え）の追加実装。`@dnd-kit` のデフォルトキーボードセンサーが提供する範囲のみとし、専用 UI は導入しない
- 並び替えのアニメーション細部のチューニング（`@dnd-kit` のデフォルトに従う）

## Decisions

### Decision 1: ドラッグハンドルは行内の `GripVertical` に限定する

行全体をドラッグソースにすると、`<input>` 内の選択ドラッグや削除ボタンのクリックと競合する。`useSortable` の `handleRef` を `GripVertical` アイコンにのみ割り当てることで、入力欄やボタンの挙動を一切奪わない。これはボード側の `Column.tsx:37-40` と同じパターン。

**Alternatives considered:**
- 行全体ドラッグ + テキスト入力で `pointerdown` を `stopPropagation`: 実装は単純だが、`<input>` 外（余白）でのドラッグ可否がユーザーに見えにくく、削除ボタンとの干渉も別途対処が必要。却下。

### Decision 2: sortable id には `EditingEntry._key`（UUID）を使う

`label` は空文字・重複が許容されており id 一意性を保証できない。`_key` はすでに React の key として行ごとに発行済みで、行の追加・並び替え・編集を通じて安定。これを `useSortable({ id: s._key, ... })` に渡し、`handleDragEnd` でも `_key` ベースで `editing` 配列を並び替える。

**Alternatives considered:**
- インデックスを id にする: `move()` ヘルパーは index 推論できるが、`useSortable` の `id` がレンダーごとに変わると DnD の内部状態が壊れるため不適。
- 並び替え時のみ `label` を使う: 上記の通り一意性なし。

### Decision 3: `useStatusEdit` の `handleMoveUp` / `handleMoveDown` を廃止し、`handleReorder(fromKey, toKey)` に置き換える

ボタンが消えるためインデックスベースの move API はもう呼び出し元がない。DnD 由来のイベントは `from` / `to` の `_key` が明確なので、key ベースの単一 API のほうがリネーム/移動の意図と一致し、配列の取り違いも起きない。`useBoardDragState` のように `move()` ヘルパーで `editing` を直接書き換える形でも実装可能だが、フックの内部状態に閉じ込めるほうが `SettingsPanel` の責務が小さく保てる。

**Alternatives considered:**
- ヘルパー `move()` を `StatusList` 内で直接呼び、`useStatusEdit` には `setEditing` 経由で結果配列を渡す: 移譲点が増えてフックの契約が緩くなる。却下。

### Decision 4: `DragDropProvider` のスコープは `StatusList` 内に閉じる

`SettingsPanel` 全体をラップする必要はなく、行のリストだけが sortable コンテキストになればよい。`StatusList` 内に `DragDropProvider` を置けば、`SettingsPanel` のレイアウト・閉じる挙動・Save/Cancel ボタンに DnD の影響が及ばない。Board と Settings で `DragDropProvider` が独立するため、相互の dnd 操作も完全に切り離される。

### Decision 5: ドラッグ中・ドロップ時に永続化は行わない

設定画面のセマンティクスは「Save を押すまで一切確定しない」。DnD で並び替えた直後に `save_statuses` を呼ぶと、Cancel での破棄ができなくなりユーザー期待と矛盾する。`handleDragEnd` は `editing` ローカル state のみを更新し、永続化は既存の `handleSave` 経由に統一する。

## Risks / Trade-offs

- **テキスト入力欄での操作干渉**: `useSortable` を行コンテナに付与すると、`<input>` 内のテキストドラッグ選択が PointerSensor に奪われる可能性がある → ドラッグハンドルを `GripVertical` だけにすることで物理的に分離し、`<input>` は sortable の対象外とする。

- **削除ボタンとドラッグ開始の混同**: 削除ボタンの pointer イベントがドラッグ開始と解釈されるリスク → ハンドルを別要素に限定し、削除ボタンは sortable 領域外として扱う（`Card.tsx:12-18` のような行全体ハンドルにはしない）。

- **キーボード操作の後退**: 上下矢印ボタンを撤去するとキーボードのみのユーザーは並び替え不能になり得る → `@dnd-kit` のデフォルト `KeyboardSensor` で `Tab` でハンドルへフォーカス → `Space` / 矢印で並び替え可能であり、回帰しない想定。導入後に手動検証で確認する。

- **保存忘れリスク**: ドラッグ操作は直感的に「すぐ反映」と感じやすく、Save を押さず閉じてしまうとロールバックされる → 既存挙動のままで、追加の警告 UI は導入しない（Non-Goal）。`SettingsPanel` の Save/Cancel ボタンが明示的に並んでいるため許容範囲。

- **DnD 中の追加/削除との競合**: ドラッグ中に Add Status や Remove で `editing` 配列が変化すると DnD 内部状態と齟齬が出る可能性 → 一般操作上、片手でドラッグしながら別操作を行う状況は実質発生しないが、`handleDragEnd` 時に `_key` が見つからない場合は no-op として防御的に処理する。
