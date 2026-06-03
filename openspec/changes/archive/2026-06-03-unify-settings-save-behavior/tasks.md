## 1. Rust backend

- [x] 1.1 `src-tauri/src/lib.rs` の `select_directory` を `pick_directory` にリネームし、副作用（state 更新 / store 永続化 / fs scope 許可）をすべて削除する。返り値は選択パス `Option<String>` のみとする
- [x] 1.2 `src-tauri/src/lib.rs` に `set_workspace_directory(path: String) -> Result<(), String>` を追加する。state 更新、`settings.json` への `workspace_dir` 永続化、fs scope への許可を行う。失敗時は文字列エラーを返す
- [x] 1.3 `invoke_handler!` の登録から `select_directory` を取り除き、`pick_directory` と `set_workspace_directory` を追加する
- [x] 1.4 `cargo check`（または `bun run tauri dev` の起動）で Rust 側がコンパイル通ることを確認する

## 2. DirectoryPicker（初回起動画面）

- [x] 2.1 `src/components/directory/DirectoryPicker.tsx` の `handleSelect` を `pick_directory` 呼び出しに置き換える
- [x] 2.2 取得したパスがある場合のみ、続けて `set_workspace_directory(path)` を呼ぶ
- [x] 2.3 `set_workspace_directory` 成功後に `onDirectorySelected(path)` を呼ぶ。失敗時は `console.error` のみ（既存の `select_directory` のサイレント失敗と同等の挙動）

## 3. SettingsPanel の pending state

- [x] 3.1 `src/components/settings/SettingsPanel.tsx` に `pendingDir: string | null` の `useState` を追加する。初期値は `null`
- [x] 3.2 既存の `handleChangeDirectory` を書き換え、`invoke<string | null>("pick_directory")` の戻り値を `setPendingDir(path)` に格納するのみとする（`onClose` も `onDirectoryChange` も呼ばない）
- [x] 3.3 表示用の現在パスを「`pendingDir ?? currentDir`」とし、`pendingDir` がある間は pending パスを表示するようにする
- [x] 3.4 "Workspace Directory" ラベル横に、`pendingDir !== null` のとき "Unsaved" のような小さな注記を表示する（`text-xs text-cork-accent` 相当。既存トークンに合わせてスタイル決定）
- [x] 3.5 `discardAndClose` ヘルパー関数を追加し、`setPendingDir(null)` を実行してから `onClose()` を呼ぶ
- [x] 3.6 Cancel ボタン・X ボタン・背景クリック・Esc ハンドラの `onClose` 呼び出しを `discardAndClose` に置き換える

## 4. SettingsPanel の Save 動線

- [x] 4.1 `useStatusEdit.handleSave` の戻り値を `Promise<boolean>` に変更（保存に成功したら `true`、バリデーション失敗時は `false`）。`src/hooks/useStatusEdit.ts` を編集する
- [x] 4.2 `SettingsPanel.handleSaveAndClose` を書き換え、以下の順に処理する: (a) `await handleSave()` を実行し `false` なら早期 return（パネルは閉じない）。(b) `pendingDir` があれば `await invoke("set_workspace_directory", { path: pendingDir })`、その後 `onDirectoryChange(pendingDir)` を呼ぶ。(c) directory が変わっていない場合のみ `onStatusesChange()` を呼ぶ（dir 変更時は `useWorkspace` の effect が再ロードするため）。(d) `setPendingDir(null)` で pending リセット。(e) `onClose()` を呼ぶ
- [x] 4.3 Save 中の二重実行を防ぐため、`isSaving` 状態を追加し、Save 中は Save ボタンと Change Directory ボタンを `disabled` にする

## 5. 視覚的微調整（ui-ux-pro-max checklist）

- [x] 5.1 "Unsaved" インジケータが light/dark 両方で十分なコントラスト（4.5:1）を持つこと（`text-cork-accent` または既存パレットで確認） — アプリは dark テーマのみ。`text-cork-accent-hover` (#818cf8) を `bg-cork-surface` (#0f172a) 上で使用し AA を充足
- [x] 5.2 Change Directory ボタンと Save ボタンの hover/disabled 状態が既存の `Button` バリアントに従っていることを確認する — `Button` の `disabled` prop を渡すだけで既存スタイルが適用される
- [x] 5.3 pending 状態でのパス表示が長いパスでも横スクロールせず truncate されることを確認する（既存 `truncate` クラスでカバー済み）

## 6. Integrate edit trigger into the path card

- [x] 6.1 `SettingsPanel.tsx` のパス表示 `<p>` を `<button type="button">` に置き換え、`displayedDir` をテキスト、右端に `FolderOpen` アイコンを配置する
- [x] 6.2 カードに `hover:bg-cork-elevated/90`、`hover:border-cork-border/60`、`transition-colors`、`cursor-pointer` を付与。`disabled` 時は `disabled:cursor-not-allowed disabled:opacity-60`
- [x] 6.3 `aria-label="Change workspace directory"` を付け、`onClick={handleChangeDirectory}`、`disabled={isSaving}` を設定
- [x] 6.4 下部ボタン行から `Change Directory` ボタンを削除し、`Cancel` と `Save` だけを `justify-end` で右寄せに配置する

## 7. Refactor unsaved indicator to header-level + Save button state

- [x] 7.1 `useStatusEdit` に `isDirty: boolean` を追加し、`editing` 配列と初期 `initialStatuses` を要素ごとに `label` 比較で算出する
- [x] 7.2 `SettingsPanel` で `useStatusEdit` から `isDirty: statusesDirty` を受け取り、`hasPendingChanges = pendingDir !== null || statusesDirty` を計算する
- [x] 7.3 Workspace Directory セクションラベル横の "• Unsaved" 表示を削除する
- [x] 7.4 パネルヘッダー（"Settings" タイトル横）に `hasPendingChanges` 真のとき "• Unsaved changes" を表示する（`text-cork-accent-hover` の uppercase 小文字インジケータ）
- [x] 7.5 Save ボタンの `disabled` 条件を `isSaving || !hasPendingChanges` に変更する

## 8. Verification

- [x] 8.1 `bun run build`（`tsc && vite build`）が型エラーなく通る
- [x] 8.2 `bun run format` を実行して Biome の指摘を解消する — 本 change で追加・変更したファイルに新規 lint 警告なし。残る既存警告（`useBoardDragState.ts:27` non-null assertion）は本 change の範囲外
- [ ] 8.3 `bun run tauri dev` で起動し、以下を手動確認する:
  - [ ] 8.3.1 初回起動の DirectoryPicker でフォルダを選ぶと Board に遷移し、再起動後も同じ workspace が復元される
  - [ ] 8.3.2 設定パネルを開いた直後は "• Unsaved changes" インジケータが出ず、Save ボタンも disabled
  - [ ] 8.3.3 パス表示カードをクリックしてフォルダを選ぶと、パネル内のパス表示が更新され、ヘッダーに "• Unsaved changes" が出て Save ボタンが enabled になる。**パネルは閉じない**
  - [ ] 8.3.4 ステータスラベルを編集 or 追加 or 削除 or 並び替えしても、ヘッダーに "• Unsaved changes" が出て Save ボタンが enabled になる
  - [ ] 8.3.5 pending 状態で Cancel を押すと、Board の workspace は変わらず、再度設定を開くと元のパスに戻っており、インジケータも消えている
  - [ ] 8.3.6 pending 状態で Esc を押す / 背景をクリックする / X を押す、いずれでも 8.3.5 と同じく破棄される
  - [ ] 8.3.7 pending 状態で Save を押すと、新しい workspace に切り替わり、Board が新ディレクトリの内容で再描画される。再起動後も新 workspace が復元される
  - [ ] 8.3.8 Statuses を編集して Save すると現在の workspace の `.cork/statuses.json` が更新される
  - [ ] 8.3.9 Statuses 編集 + Directory 変更を同時に行って Save すると、**旧** workspace の `.cork/statuses.json` が更新された上で新 workspace に切り替わる
  - [ ] 8.3.10 Statuses に重複ラベルがある状態で Save を押すと、エラー表示が出てパネルが閉じず、Directory も切り替わらない
  - [ ] 8.3.11 パス表示カードに hover すると背景色が変わり、cursor:pointer になる
  - [ ] 8.3.12 ボード側のドラッグ&ドロップ、タスク作成、ステータス変更、再起動後のディレクトリ復元など既存機能が回帰していない
