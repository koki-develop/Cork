## Context

現在 status 名の変更はフロントエンドの `useStatusEdit.handleLabelBlur` → `persist` → `saveStatuses` (Tauri `save_statuses`) の流れで `.cork.json` のみを更新する。各タスクは Markdown ファイルの frontmatter に `status: <label>` を持ち、この値は書き換えられないため、古い label を参照するタスクは Board 上で表示されなくなる。

Rust 側には既に `update_task_status` コマンドがあり、単一ファイルの frontmatter の `status` フィールドを書き換える実装が存在する。これをバッチ処理に拡張する形で実現する。

## Goals / Non-Goals

**Goals:**
- status 名変更時に、その label を持つ全タスクの frontmatter `status` フィールドを新しい label に書き換える
- 変更は `save_statuses` と同じ Tauri コマンド内で同期的に行われる（フロントエンドは結果を待ってから再描画）
- タスクファイルの書き換えは `.cork.json` より前または後に行い、中途半端な状態が残らないようにする

**Non-Goals:**
- status 削除時のタスク処理（別 change で対応）
- タスクの body や title への影響は一切ない
- 複数 status の一括リネーム（rename map は一度の保存で変化した差分のみ）

## Decisions

### Decision 1: Rust 側で差分を検出し frontmatter を書き換える

`save_statuses` は現在 Rust 側で既存の statuses を読み込まず、受け取った配列をそのまま書き込む。しかし今回は差分検出が必要になる。

**選択肢 A**: フロントエンド側で変更前後の statuses 配列を比較し、rename map (`{old: new}`) を Tauri コマンドに渡す
**選択肢 B**: Rust 側の `save_statuses` で現在の `.cork.json` と新しい配列を比較し、rename map を自前で計算する

**採用: 選択肢 A**

理由:
- フロントエンドの `useStatusEdit` は既に `editing` 状態と `lastPersisted` を管理しており、差分を計算するのに必要な情報を既に持っている
- 単純な配列の比較ロジックは小さく、テストも容易
- Rust 側は rename map を受け取って機械的に書き換えるだけで、責務が明確になる

### Decision 2:  rename map のフォーマット

`Record<string, string | null>` — key が old label, value が new label。new label が null の場合は該当タスクから status を削除しない（今回のスコープ外）。

`save_statuses` のシグネチャを `(statuses: Vec<StatusEntry>, rename_map: HashMap<String, String>)` に拡張する。

### Decision 3: 書き込み順序 — `.cork.json` を先に書き、エラー時はロールバックしない

1. `.cork.json` を新しい statuses 配列で書き込む
2. 全該当タスクの frontmatter を更新する
3. エラーが発生した場合、`.cork.json` は既に新しい状態になっているが、タスクの不一致は次回保存時に修正可能なため許容する

ロールバックを実装すると複雑になるわりに、タスク frontmatter の書き込み失敗は稀（主にファイルパーミッション起因）であり、次回の同操作で再試行可能。

### Decision 4: フロントエンドは `saveStatuses` 完了後にタスク一覧を再読み込みする

`useStatusEdit.persist` 内の `saveStatuses` 呼び出し後、既存の `onStatusesChange` に加えて `loadTasks` も実行するよう変更する。これにより Board が最新状態に更新される。

## Risks / Trade-offs

- [大きなワークスペースでのパフォーマンス] 大量のタスクファイルがある場合、全タスクを走査して frontmatter を書き換える I/O が発生する → 現状の想定ユースケースでは問題にならない。必要なら後で非同期処理に変更可能
- [rename map の曖昧さ] 同じ値を指す status が複数ある場合の差分検出が困難になる → 現在の UI では重複 label は保存時に排除される (`useStatusEdit.persist` の validation)
- [外部エディタとの衝突] ファイル監視が走ると frontmatter 書き換え後すぐに再読み込みが入る → 正常動作（変更を検知してタスク一覧が更新される）
