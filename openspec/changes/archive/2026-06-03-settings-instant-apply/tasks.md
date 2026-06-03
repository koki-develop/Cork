## 1. `useStatusEdit` の API を即時反映版に書き直す

- [x] 1.1 `useStatusEdit(initialStatuses, { onStatusesChange })` に引数を変更し、永続化成功時に呼び出すコールバックを受け取る形にする
- [x] 1.2 `handleSave` / `isDirty` を削除する
- [x] 1.3 内部に「重複チェック + トリム + 永続化」を行う private な `persist(nextEditing)` を実装する。重複時は `error` state にメッセージを格納し `save_statuses` を呼ばずに早期 return する
- [x] 1.4 `handleRemove(index)` を「ローカル state から削除 → `persist` を呼んで永続化 → 成功時に `onStatusesChange` を呼ぶ」形に書き換える
- [x] 1.5 `handleDragEnd(event)` を「`event.canceled` なら snapshot に戻す、そうでなければ `persist` を呼んで永続化 → 成功時 `onStatusesChange`」に書き換える。`dragSnapshot` は引き続き使う
- [x] 1.6 `handleLabelBlur(index)` を新規追加する。`label.trim()` で空なら当該行を除外、内容があるなら `persist` を呼ぶ
- [x] 1.7 `handleLabelChange(index, label)` はローカル state 更新のみで据え置く
- [x] 1.8 `handleAdd` はローカル state 更新のみで据え置く（追加直後の永続化はしない）
- [x] 1.9 戻り値から `handleSave` / `isDirty` を削除し、`handleLabelBlur` を追加する

## 2. `StatusRow` に `onBlur` を伝搬する

- [x] 2.1 `StatusRow` の props に `onLabelBlur: (index: number) => void` を追加する
- [x] 2.2 `<input>` に `onBlur={() => onLabelBlur(index)}` を結線する

## 3. `StatusList` で `onLabelBlur` をリレーする

- [x] 3.1 `StatusList` の props に `onLabelBlur: (index: number) => void` を追加する
- [x] 3.2 各 `StatusRow` に `onLabelBlur` を渡す

## 4. `SettingsPanel` を即時反映ベースに書き換える

- [x] 4.1 `pendingDir`、`isSaving`、`hasPendingChanges`、`discardAndClose`、`discardAndCloseRef`、`handleSaveAndClose` を削除する
- [x] 4.2 `Esc` ハンドラを `onClose()` を呼ぶだけに書き換える（変更破棄ロジックは持たない）
- [x] 4.3 背景クリックの `onClick` を `onClose` 直結に変える
- [x] 4.4 `handleChangeDirectory` を「`pick_directory` → 返り値が非 null かつ `currentDir` と違うなら `set_workspace_directory` を呼んで `onDirectoryChange(path)` を呼ぶ」形に書き換える
- [x] 4.5 ヘッダー領域の `Unsaved changes` インジケータと前面の「`hasPendingChanges` チェック」を削除する
- [x] 4.6 フッターの `Save` / `Cancel` ボタン (`flex justify-end gap-2` の `<div>`) を削除する
- [x] 4.7 `useStatusEdit` の呼び出しを新 API に合わせる（`onStatusesChange` コールバックを渡し、`handleLabelBlur` を `StatusList` に渡す）
- [x] 4.8 Workspace Directory ボタンの `disabled={isSaving}` 等の不要な属性を取り除く

## 5. 手動検証

- [x] 5.1 `bun run build` で型チェックが通ることを確認する
- [x] 5.2 `bun run tauri dev` を起動して、Workspace Directory をピックした瞬間に Board が新ディレクトリへ切り替わることを確認する
- [x] 5.3 ステータスをゴミ箱で削除した瞬間に Board のカラムが消えることを確認する
- [x] 5.4 ステータスをドラッグで並び替えた瞬間に Board のカラム順が変わることを確認する
- [x] 5.5 `Add Status` で空行を増やしてフォーカスを外すと行が消えることを確認する
- [x] 5.6 ステータスを編集してフォーカスを外すと永続化され、設定パネルを開き直しても保持されていることを確認する
- [x] 5.7 既存と重複するラベルを入力してフォーカスを外すとエラーメッセージが出て、`save_statuses` が呼ばれないことを確認する（重複を直してフォーカスを外すと保存されること）
- [x] 5.8 Esc キーと背景クリックで設定パネルを閉じてもデータが破棄されないことを確認する
- [x] 5.9 設定パネルに `Save` / `Cancel` ボタンと `Unsaved changes` インジケータが一切表示されないことを確認する
