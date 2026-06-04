## 1. Rust: `save_statuses` に rename map を受け取る処理を追加

- [x] 1.1 `save_statuses` のシグネチャを `(statuses: Vec<StatusEntry>, rename_map: HashMap<String, String>)` に拡張する
- [x] 1.2 rename map が空でない場合、ワークスペース内の全 `.md` ファイルを走査し、frontmatter `status` が rename map の key に一致するファイルの status を value に書き換える
- [x] 1.3 書き換え対象のファイルは canonicalize + workspace directory チェックをパスしたもののみに制限する（既存のセキュリティモデルに従う）
- [x] 1.4 rename map が空の場合（リネームなし）は従来どおり `.cork.json` のみ書き込む

## 2. Frontend API: `saveStatuses` に rename map を渡せるように変更

- [x] 2.1 `src/api/statuses.ts` の `saveStatuses` を `(statuses: StatusEntry[], renameMap?: Record<string, string>)` に変更する
- [x] 2.2 `saveStatuses` 呼び出し部分で Tauri invoke の引数に `renameMap` を含める

## 3. Frontend: `useStatusEdit` で rename map を計算して渡す

- [x] 3.1 `persist` 関数内で `prev`（`lastPersisted.current`）と `candidate` を比較し、同一インデックスのラベル差分から rename map を計算する
- [x] 3.2 `saveStatuses(candidate)` の呼び出しに rename map を追加する
- [x] 3.3 rename map が空でない場合、保存完了後にタスク一覧を再読み込みするための `onTasksChange` コールバックを `useStatusEdit` の Options に追加する
- [x] 3.4 `BoardPage` で `useStatusEdit` に `onTasksChange: loadTasks` を渡す

## 4. Frontend: `useWorkspace` から `loadTasks` を公開

- [x] 4.1 `useWorkspace` の return に `loadTasks` を追加する（既に存在していた）
- [x] 4.2 `BoardPageProps` に `loadTasks` を追加する
- [x] 4.3 `BoardPage` で `loadTasks` を `useStatusEdit` に渡す

## 5. 動作検証

- [x] 5.1 `bunx tsc --noEmit` で型エラーが無いことを確認する
- [x] 5.2 `bunx biome check src` で lint / format エラーが無いことを確認する
- [x] 5.3 `cargo clippy` で Rust 側の警告・エラーが無いことを確認する
- [ ] 5.4 `bun run tauri dev` でステータス名変更 → タスク status 同期 → Board 反映を目視確認する
