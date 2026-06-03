## Why

設定画面の「Workspace Directory」変更は、ディレクトリピッカーで選択した瞬間に Tauri バックエンドの `state.workspace_dir` と `settings.json` ストアへ即時反映され、その場で設定パネルが閉じてしまう（`SettingsPanel.tsx:54-60`, `lib.rs:36-59`）。一方、同じ設定パネルにある「Statuses」は Save ボタンを押して初めて永続化される。同じパネル内で「即時反映される項目」と「Save が必要な項目」が混在しており、ユーザーのメンタルモデルが破綻している。Cancel を押しても Directory 変更は取り消せず、誤クリック時のリカバリーもない。

## What Changes

- 設定パネルの「Change Directory」ボタンを「Statuses」と同じ Save ベースの編集モデルに統一する。ディレクトリピッカーは「候補パス」を返すだけにし、Save 押下時にまとめて永続化する
- 設定パネルに「pending workspace directory」のローカル状態を追加し、未保存変更があることを視覚的に示すマイクロインジケータを表示する
- Save ボタンは「statuses の保存」と「workspace directory の確定」を順に行い、最後にパネルを閉じる。Cancel と Esc は両方の変更を破棄してパネルを閉じる
- ディレクトリピッカーを開く Tauri コマンドを「パス選択のみ（副作用なし）」と「workspace directory の確定（state 更新 + 永続化 + fs scope 許可）」の 2 段階に分割する
- **BREAKING**: Rust 側の `select_directory` コマンドは副作用を伴わない `pick_directory` にリネームし、新たに `set_workspace_directory(path)` を追加する。フロントエンドの呼び出し元（初回起動の `DirectoryPicker` と設定画面）は両方をペアで呼ぶ形に書き換える

## Capabilities

### New Capabilities

- `settings-save-unified`: 設定パネル内のすべての項目（workspace directory, statuses）を Save ボタンで一括コミットし、Cancel/Esc で一括破棄するセマンティクスを規定する capability。pending 状態の可視化、保存順序、ピッカーの副作用分離も含む

### Modified Capabilities

なし — `openspec/specs/` に既存 spec は存在しない

## Impact

- **`src/components/settings/SettingsPanel.tsx`**: `handleChangeDirectory` を「pending パスを state に積むだけ」に変更。`handleSaveAndClose` が statuses 保存 → directory 確定の順で実行。pending 中の表示と Cancel/Esc での破棄を実装
- **`src/components/directory/DirectoryPicker.tsx`**: 初回起動時のディレクトリ選択フロー。`pick_directory` + `set_workspace_directory` のペア呼び出しに書き換え。挙動はユーザーから見て変わらない
- **`src/App.tsx`**: `useWorkspace` の `setDir` だけでは backend 永続化が起きなくなるため、ディレクトリ確定の Tauri 呼び出し呼び出し順を調整
- **`src/hooks/useWorkspace.ts`**: directory 変更時に `set_workspace_directory` を呼ぶか、呼び出しを App 側に寄せるか整理
- **`src-tauri/src/lib.rs`**: `select_directory` を `pick_directory`（ピッカーを開いてパスのみ返す）に変更。新規 `set_workspace_directory(path)` を追加（state 更新 + store 永続化 + fs scope 許可）。`invoke_handler` の登録を差し替え
- **依存関係**: 新規追加なし
- **テスト**: 手動検証中心。`bun run build` で型チェック、Tauri dev で UI フローを確認
