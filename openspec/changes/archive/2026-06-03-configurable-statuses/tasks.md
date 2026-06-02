# Tasks: 設定で任意のステータスを定義できるようにする

## 1. Rust: ステータス設定の保存/読み込みコマンド

- [x] `src-tauri/src/lib.rs` に `StatusEntry` 構造体を追加
- [x] `get_statuses` Tauri コマンドを追加:
- [x] `save_statuses` Tauri コマンドを追加:
- [x] 新しいコマンドを `invoke_handler` に登録

## 2. Frontend: 型定義の更新

- [x] `src/types.ts` を修正:
  - `Status` 型（union）を削除
  - `StatusEntry` インターフェースを追加（`{ label: string }`）
  - `Task.status` の型を `Status` から `string` に変更

## 3. Frontend: App.tsx でステータス設定を読み込む

- [x] `App.tsx` で `invoke<StatusEntry[]>("get_statuses")` を呼び出して statuses を取得
- [x] 空の場合はデフォルト値 `[{ label: "Todo" }, { label: "Doing" }, { label: "Done" }]` を使用
- [x] Board に `statuses` props を追加して渡す
- [x] 設定変更時のコールバック `onStatusesChange` を用意

## 4. Frontend: Board を動的カラム生成に変更

- [x] `src/Board.tsx` のハードコードされた `COLUMNS` 定数を削除
- [x] props で受け取った `statuses` から動的にカラムを生成
- [x] 色は `STATUS_COLORS` パレットからインデックスで割り当て

## 5. Frontend: Card を動的ステータス表示に変更

- [x] `src/Card.tsx` のハードコードされた `STATUSES` 定数を削除
- [x] props で受け取った `statuses` から "Move to" ボタンを生成
- [x] `statusLabel` 関数を削除（ラベルをそのまま表示）

## 6. Frontend: SettingsPanel にステータス編集 UI を追加

- [x] ステータス一覧を表示（各行にラベル入力フィールド）
- [x] 「追加」ボタンで新しい空行を追加
- [x] 各行の「削除」ボタンでその行を削除
- [x] 「上」「下」ボタンで順序変更
- [x] 「保存」ボタンで `invoke("save_statuses", { statuses })` を呼び出し
- [x] 保存後、親に変更を通知して Board を再レンダリング

## 7. 動作確認

- [x] `cargo clippy` がパスする
- [x] `bun run build`（`tsc && vite build`）がパスする
- [x] `biome check --write src` がパスする
- [ ] 設定画面でステータスの追加・削除・順序変更ができる
- [ ] 変更したステータスで Board のカラムが動的に更新される
- [ ] カードの "Move to" ボタンが動的に更新される
- [ ] アプリ再起動後も設定が維持される
- [ ] ステータス変更が Markdown ファイルの frontmatter に正しく書き込まれる
