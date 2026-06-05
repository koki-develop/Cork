## 1. Rust バックエンド — Task 型 & frontmatter ヘルパー

- [x] 1.1 `src-tauri/src/task.rs::Task` に `tags: Vec<String>` を追加 (`#[serde(default)]`)
- [x] 1.2 `src-tauri/src/task.rs::TaskFrontmatter` に `tags: Vec<String>` を追加し、不正型/欠落/`null` を `Vec::new()` にフォールバックする lenient deserializer (`#[serde(default, deserialize_with = ...)]`) を実装
- [x] 1.3 `src-tauri/src/frontmatter.rs` に `remove_keys(content: &str, keys: &[&str]) -> String` を新設し、frontmatter から指定キーを除去 (本文/他キーは保持、`ensure_trailing_newline` で末尾改行)
- [x] 1.4 `frontmatter.rs` のユニットテストに以下を追加: `remove_keys` の単一/複数キー削除、frontmatter なしファイルでの no-op、配列 / 整数 / 文字列タイプの値削除

## 2. Rust バックエンド — list_tasks / get_task

- [x] 2.1 `list_tasks` の `Task` 生成箇所で `tags: fm.tags.clone()` または `fm.tags` を埋める (空配列でも明示セット)
- [x] 2.2 `get_task` の `Task` 生成箇所で同様に `tags` をセット
- [x] 2.3 task.rs のユニットテストに `read_task_preview` 経由でのタグありファイルの parse テスト (Vec)、null/欠落/文字列単体のラウンドトリップ (= 空配列フォールバック) を追加

## 3. Rust バックエンド — create_task

- [x] 3.1 `create_task` シグネチャに `tags: Option<Vec<String>>` を追加
- [x] 3.2 `fm_value` に対し `tags.as_ref().map(|t| !t.is_empty())` が真のときのみ `obj.insert("tags", json!(tags))` する
- [x] 3.3 戻り値の `Task.tags` を `tags.unwrap_or_default()` にセット
- [x] 3.4 `lib.rs` 側でハンドラ登録に変更が無いことを確認 (シグネチャ変更だけでマクロは追従)

## 4. Rust バックエンド — update_task

- [x] 4.1 `update_task` シグネチャに `tags: Option<Vec<String>>` を追加
- [x] 4.2 `TaskFrontmatter` を読み出す既存ロジックを拡張し `current_tags: Vec<String>` を取得
- [x] 4.3 `tags` パラメータが `Some(non_empty)` のとき: `fm_updates.push(("tags", json!(t)))` で frontmatter::update に渡す
- [x] 4.4 `tags` パラメータが `Some(empty)` のとき: `frontmatter::update` で他フィールドを更新したあと `frontmatter::remove_keys(&content, &["tags"])` を適用して `tags` キーを除去
- [x] 4.5 `tags` パラメータが `None` のとき: frontmatter には touch しない (既存 `tags` キーがあればそのまま残る)
- [x] 4.6 戻り値 `Task.tags` を更新後の値で返す (Some なら渡された値、None なら current_tags)
- [x] 4.7 title 変更 (rename) 経路でも `tags` が保持されることを確認

## 5. Rust バックエンド — 単体テスト (task.rs / frontmatter.rs)

- [x] 5.1 `Task` 型の serde シリアライズに `tags` キーが含まれることをテスト
- [x] 5.2 `TaskFrontmatter` の deserialize: `tags: ["a", "b"]`、`tags: null`、`tags:` 欠落、`tags: "string"`、`tags: 42` の 5 ケースで `tags == vec![] | vec!["a", "b"]` を検証
- [x] 5.3 `frontmatter::update` + `frontmatter::remove_keys` のラウンドトリップ: タグ追加 → 別キー更新 → タグ削除で frontmatter が想定形になる
- [x] 5.4 `cargo test` がすべてパスすることを確認

## 6. フロントエンド — 型 & API ラッパー

- [x] 6.1 `src/types/task.ts::Task` に `tags: string[]` を追加
- [x] 6.2 `src/api/tasks.ts` (またはそれに該当するモジュール) の `createTask` / `updateTask` ラッパーの引数型に `tags?: string[]` を追加し、invoke にそのまま渡す
- [x] 6.3 `src/api/tasks.ts` の戻り値型 (`Task`) で `tags` が必須プロパティとして扱われるよう型を整合

## 7. フロントエンド — フック (楽観的更新)

- [x] 7.1 `src/hooks/useWorkspace.ts` (またはタスク状態を持つフック) で `createTask` 成功時に新規 Task の `tags` をローカル state に反映
- [x] 7.2 `updateTask` を呼ぶハンドラで `tags` を含む updates が来た場合に optimistic 反映する (既存の `setTasks` の merge に `tags` を追加)
- [x] 7.3 `list_tasks` 結果の取り込み時に `tags` がそのまま使えることを確認 (型が string[] であれば追加処理不要)

## 8. フロントエンド — atoms / molecules 追加

- [x] 8.1 `src/components/atoms/TagChip.tsx` を新規作成: props `{ label: string; onRemove?: () => void; className?: string }`。`onRemove` が無い場合は表示専用 (× アイコン非表示)、ある場合は末尾に `lucide-react` の `X` (size-3) を表示し `aria-label="Remove tag {label}"` を付与
- [x] 8.2 `TagChip` のスタイル: `inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs bg-cork-elevated/60 border border-cork-border/40 text-cork-muted max-w-[140px]`、テキストは `truncate`
- [x] 8.3 `src/components/atoms/index.ts` から `TagChip` を re-export
- [x] 8.4 `src/components/molecules/TagList.tsx` を新規作成: props `{ tags: string[]; maxVisible?: number; className?: string }`。`maxVisible` (default 3) を超える場合は超過分を `+N` overflow チップで集約。空配列なら `null` を返して何も描画しない
- [x] 8.5 `src/components/molecules/TagEditor.tsx` を新規作成: props `{ tags: string[]; onChange: (next: string[]) => void; onPendingChange?: (pending: string) => void; ariaLabel?: string }`。チップ列 + 末尾 input を描画し、Enter / カンマ / blur で追加、空入力 + Backspace で末尾削除、重複/空文字は silent ignore、`e.nativeEvent.isComposing` の Enter は無視
- [x] 8.6 `TagEditor` の内部で `TagChip` を使ってチップを描画し、削除ハンドラを `onChange(tags.filter((_, i) => i !== index))` で実装
- [x] 8.7 `TagEditor` の入力欄 ref を外部からアクセスできるように `imperativeHandle` で `flush(): string[]` を提供 (close 時の flush 用)。あるいは `onPendingChange` でペンディング値を外部に通知する設計でも可
- [x] 8.8 `src/components/molecules/index.ts` から `TagList`, `TagEditor` を re-export

## 9. フロントエンド — KanbanCard でのタグ表示

- [x] 9.1 `src/components/organisms/board/KanbanCard.tsx` で `TagList` をインポート
- [x] 9.2 本文プレビュー (`bodyPreview`) の `<Text>` ブロックの直下に `<TagList tags={task.tags} className="mt-2" />` を追加
- [x] 9.3 タグなしタスクで余分な mt 余白が出ないことを目視確認

## 10. フロントエンド — TaskDetailDialog でのタグ編集

- [x] 10.1 `src/components/organisms/board/TaskDetailDialog.tsx` で `TagEditor` をインポート
- [x] 10.2 ローカル state `tags: string[]` と `originalRef.current.tags` を追加し、`isOpen` 変更時の reset で `task.tags` を反映
- [x] 10.3 `hasChanged` を `"tags"` も扱えるよう拡張 (配列の浅い比較で要素長と各要素を比較)
- [x] 10.4 Body フィールドの下に "Tags" ラベル + `<TagEditor tags={tags} onChange={handleTagsChange} ariaLabel="Tags" />` ブロックを追加
- [x] 10.5 `handleTagsChange(next)` で `setTags(next)` → `save({ tags: next })` を即時呼び (チップ追加/削除/Backspace 削除のすべてで発火)
- [x] 10.6 `handleClose` で `TagEditor` の pending 入力を flush するため、`TagEditor` の ref から `flush()` を取得して呼び、pending が非空かつ重複でないなら `dirtyUpdates.tags = [...tags, pending]` をセット
- [x] 10.7 save エラー時に `originalRef.current.tags` に巻き戻し、`error` state にメッセージをセット

## 11. フロントエンド — CreateTaskDialog でのタグ入力

- [x] 11.1 `src/components/organisms/board/CreateTaskDialog.tsx` で `TagEditor` をインポート
- [x] 11.2 `CreateTaskDialogProps.onCreateTask` の型を `(title: string, status: string, body: string, tags: string[]) => Promise<void>` に変更
- [x] 11.3 ローカル state `tags: string[]` (初期値 `[]`) を追加し、`prevOpenRef` ベースの reset で `[]` に戻す
- [x] 11.4 Body フィールドの後ろに "Tags" ラベル + `<TagEditor tags={tags} onChange={setTags} ariaLabel="Tags" />` ブロックを追加
- [x] 11.5 `handleSubmit` で `TagEditor.flush()` を呼んで未確定文字列を取り込み、最終 `tags` 配列を `onCreateTask` に渡す
- [x] 11.6 親 (`App.tsx` または該当 page) の `onCreateTask` ハンドラを 4 引数化し、`createTask(title, status, body, tags)` を呼ぶ
- [x] 11.7 `src/api/tasks.ts::createTask` の引数型に `tags: string[]` を追加し invoke 経路に通す (Section 6.2 との整合性確認)

## 12. 動作確認 & 仕上げ

- [x] 12.1 `cargo test --manifest-path src-tauri/Cargo.toml` で全テスト通過
- [x] 12.2 `bunx tsc --noEmit` で 0 エラー
- [x] 12.3 `bunx biome check src` で 0 警告 (新規ファイルにも path-restriction 違反がないこと)
- [x] 12.4 `bun run tauri dev` でアプリを起動し、以下を手動検証:
  - 既存 (`tags` 無し) タスクが従来通り表示される
  - 新規作成ダイアログでタグを 2 個入れて Create → カード/詳細でその 2 個が表示される
  - 新規作成ダイアログで Tags 入力欄に文字列を残したまま Create → 自動 flush されてタグ化される
  - 詳細ダイアログでタグを 3 個追加 → カード上に 3 チップ表示、保存して再起動後も残る
  - タグを 4 個以上追加 → カード上は 3 + `+N` 表示、詳細ダイアログでは全件表示
  - 詳細ダイアログでタグを全削除 → ファイル frontmatter から `tags:` キーが完全に消えていること (テキストエディタで確認)
  - 重複タグの Enter → silent ignore、入力欄はクリア
  - 空入力欄での Backspace → 末尾チップ削除
  - 入力中に dialog を Escape → ペンディング文字がチップ化されてから閉じる
  - IME 変換 (例: 日本語) 中の Enter 確定では、タグが意図せず追加されない
- [x] 12.5 `openspec validate task-tags --strict` で warnings 0
