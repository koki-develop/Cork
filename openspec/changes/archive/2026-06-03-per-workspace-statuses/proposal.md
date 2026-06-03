## Why

現在 statuses 設定は OS ごとのアプリデータディレクトリにある `settings.json` 単一ファイルにグローバル保存されている (`src-tauri/src/lib.rs:108-117`, `lib.rs:264-288`)。そのため作業ディレクトリ A・B で同じ status 構成が強制され、プロジェクトごとに違うワークフロー（例: 開発リポジトリは `Backlog/In Progress/Review/Done`、個人タスクは `Todo/Doing/Done`）を使い分けられない。
作業ディレクトリ単位で statuses を独立管理するため、設定の保存場所そのものを作業ディレクトリ内へ移し、Cork 外で `.cork.json` を直接編集した場合も即時反映するようにする。

## What Changes

- 作業ディレクトリ直下に `.cork.json` というファイルを新設し、そこに statuses を保存する。スキーマは `{ "statuses": [{ "label": string }, ...] }`
- Tauri コマンド `get_statuses` / `save_statuses` を「現在の `AppState.workspace_dir` 配下の `.cork.json` を読み書きする」実装に置き換える
- `list_tasks` がデフォルトステータス推定に使うソースも `.cork.json` に変更する
- `useWorkspace` の `watch()` コールバックを拡張し、`.cork.json` の変更イベントを検知したら `loadStatuses` と `loadTasks` を再実行する（Cork 外からのエディタ編集にもリアルタイム追従）
- 作業ディレクトリ切替時は新ディレクトリの `.cork.json` を読み直す
- **BREAKING**: グローバル `settings.json` の `statuses` キーは完全に廃止する。`get_statuses` / `save_statuses` はもうそこを参照しない。既存ユーザーの `statuses` 設定は引き継がない（マイグレーション処理を行わない）
- 作業ディレクトリ未選択時の `get_statuses` / `save_statuses` はエラーを返す（旧仕様では暗黙にグローバル設定を返していた）
- `.cork.json` が存在しない / JSON として不正な場合、`get_statuses` は空配列を返す。フロントエンドは従来通り `DEFAULT_STATUSES` (`Todo/Doing/Done`) を表示するが、永続化はしない（ユーザーが設定パネルで何か操作した瞬間に `.cork.json` が作成される）

## Capabilities

### New Capabilities

- `per-workspace-statuses`: 作業ディレクトリごとに statuses 設定を `.cork.json` で独立管理する capability。ファイルの読み書き、外部編集の watch、未選択 / 不正ファイル時のフォールバック、`list_tasks` のデフォルトステータス参照先を規定する

### Modified Capabilities

なし — `openspec/specs/` に既存 spec は存在しない（過去の `configurable-statuses` も spec 化されずに archive されている）

## Impact

- **`src-tauri/src/lib.rs`**: `get_statuses` / `save_statuses` を `tauri_plugin_store` から `.cork.json` への直接 I/O に書き換える。シグネチャを `tauri::State<'_, AppState>` を受ける形に変更（`AppHandle` は不要に）。`list_tasks` のデフォルトステータス読み込みも同じ I/O に切替
- **`src/hooks/useWorkspace.ts`**: `watch()` ハンドラを `.cork.json` 変更イベントにも反応させ、`loadStatuses` と `loadTasks` を再実行する。`dir` 切替で `loadStatuses` が走るのは既存と同じ
- **`src/components/settings/SettingsPanel.tsx`**: 直接の変更はないが、`useStatusEdit` 経由で呼ぶ `save_statuses` がワークスペース未選択時にエラーを返す可能性が出る（既存のエラーハンドリングで吸収）
- **`settings.json`（グローバル）**: `statuses` キーを書き込まなくなる。`workspace_dir` キーは継続利用
- **依存関係**: 追加なし（`serde_json` は既存依存。`tauri_plugin_store` は `workspace_dir` 用に残す）
- **テスト**: 手動検証中心。`bun run build` で型チェック、`bun run tauri dev` で複数ディレクトリ切替と外部編集の watch を確認
