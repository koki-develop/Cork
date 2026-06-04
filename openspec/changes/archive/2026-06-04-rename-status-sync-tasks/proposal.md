## Why

Setting 画面で status 名を更新したときに、同じ label を持つタスクの status も自動的に書き換えたい。現在は `.cork.json` の statuses 配列だけが更新され、既存タスクの frontmatter は古い label のまま残るため、Board 上でタスクが表示されなくなる。

## What Changes

- `save_statuses` Tauri コマンドに古い label → 新しい label のマッピング情報を渡せるようにする
- status 名変更時に、該当する全タスクの frontmatter の `status` フィールドを新しい label に書き換える
- 変更が発生した場合、フロントエンドはタスク一覧を再読み込みして Board を最新状態に保つ

## Capabilities

### New Capabilities
- `rename-status-sync`: status 名変更時に紐づく全タスクの frontmatter を同期する

### Modified Capabilities

（既存の spec に Requirements レベルの変更はない。`per-workspace-statuses` の storage 方法に変更はなく、動作の拡張のみ。）

## Impact

- **Rust backend**: `save_statuses` が status 名変更を検出した場合、該当タスクの frontmatter を書き換える処理を追加
- **Frontend API**: `saveStatuses` が同期的なタスク status 書き換えをトリガー、完了後にタスク一覧を再取得する
- **`.md` ファイル**: 該当タスクのファイルに書き込みが発生する
