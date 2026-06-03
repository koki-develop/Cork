## Why

設定画面では現在、Workspace Directory / Statuses の両方が「Save ボタン押下時にまとめて永続化」される編集モデル（`SettingsPanel.tsx:75-94`、`useStatusEdit.ts:50-68`）になっている。直前の `unify-settings-save-behavior` 変更で「両方とも Save ベース」に揃えた直後だが、実際に使ってみると Save/Cancel ボタンによる確定操作は冗長で、設定を変えるたびに 2 ステップを踏む必要がありストレスが大きい。さらに「Cancel で破棄できる」というセマンティクスを担保するためだけに pending 状態を持たせており、コードも複雑化している。各操作の意味が「ユーザーが意図的に行う離散的なアクション」なので、操作した瞬間に確定してしまったほうが直感に合う。

## What Changes

- 設定パネルの `Cancel` / `Save` ボタンを **削除** する。Esc キーと背景クリックは「変更の破棄」ではなく単に「パネルを閉じる」だけの操作に変える
- Workspace Directory の変更を **即時反映** にする：ピッカーでフォルダを選んだ瞬間に `set_workspace_directory` を呼び、`useWorkspace` の `dir` も同時に更新する
- Statuses の操作を以下のタイミングで **即時反映** にする：
  - **削除**: ゴミ箱クリック直後に `save_statuses` を呼ぶ
  - **並び替え**: DnD の `onDragEnd` 直後に `save_statuses` を呼ぶ
  - **追加・名称変更**: 入力中はローカル state のみ更新し、`<input>` から **フォーカスが外れたタイミング (`onBlur`)** で `save_statuses` を呼ぶ
- 追加で生成された空ラベル行は、フォーカスを外した時点で `label.trim() === ""` ならローカル state からも除外する（永続化もスキップ）
- 重複ラベル検出は引き続き保存前に行い、重複している場合はトーストやインラインメッセージで通知してその回の永続化のみ中断する（フォーカスは元の入力に戻し、ユーザーが直し終わるまで再度 `onBlur` で再試行）
- pending 状態（`pendingDir`、`isDirty`、`Unsaved changes` インジケータ）と関連ロジックを削除する
- **BREAKING**: `useStatusEdit` フックの API を一新する。`handleSave` / `isDirty` を削除し、代わりに即時永続化を担う `handleRemove`（永続化込み）、`handleReorder`（永続化込み）、`handleLabelBlur`（永続化込み・トリム・空行除外）を提供する

## Capabilities

### New Capabilities

- `settings-instant-apply`: 設定パネル内の全操作を Save ボタンなしで即時永続化する capability。Workspace Directory はピック直後、Statuses の削除・並び替えは操作直後、追加・名称変更はフォーカスアウト時に確定する。空ラベル行のフォーカスアウト時除外、重複検出時の挙動、Esc / 背景クリックは「閉じるだけ」のセマンティクスを規定する

### Modified Capabilities

なし — `openspec/specs/` に既存 spec は存在しない（`unify-settings-save-behavior` も spec を生成していない）

## Impact

- **`src/components/settings/SettingsPanel.tsx`**: `Save` / `Cancel` ボタン削除。`pendingDir`、`isSaving`、`hasPendingChanges`、`Unsaved changes` インジケータ、`handleSaveAndClose`、`discardAndClose` などを削除。`handleChangeDirectory` を「`pick_directory` → `set_workspace_directory` → `onDirectoryChange` を一気通貫で呼ぶ」形に書き換える
- **`src/components/settings/StatusRow.tsx`**: `<input>` に `onBlur` を生やし、親へ通知する props を追加（例: `onLabelBlur(index)`）
- **`src/components/settings/StatusList.tsx`**: `onLabelBlur` を `StatusRow` に流すだけ。`Add Status` ボタンの挙動はそのまま（追加→フォーカス遷移後の `onBlur` 検証で空なら除外）
- **`src/hooks/useStatusEdit.ts`**: 即時永続化版に書き直す。`handleSave`/`isDirty`/`dragSnapshot` を削除。`handleRemove`、`handleReorder`（DnD のドロップ確定）、`handleLabelBlur` で `save_statuses` を呼ぶ。重複検出と空行除外もこのレイヤで処理。永続化成功時に親へ通知するため `onStatusesChange` コールバックを受け取る
- **`src/components/board/Board.tsx`**: `SettingsPanel` の `key={String(settingsOpen)}` による強制再マウントは継続（毎回 fresh な状態にしたいため）。`onStatusesChange` の意味は変わらない
- **`src-tauri/src/lib.rs`**: 変更なし（`pick_directory`、`set_workspace_directory`、`save_statuses` はすでに分離済み）
- **依存関係**: 新規追加なし
- **テスト**: 手動検証中心。`bun run build` で型チェック、`bun run tauri dev` で UI フローを確認
