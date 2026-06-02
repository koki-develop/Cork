# Tasks: Markdown Kanban ビュー

## 1. Rust バックエンド: ディレクトリ選択コマンド

- [x] `select_directory` Tauri コマンドを実装する
- [x] `rfd` クレートを使ってネイティブダイアログを開く
- [x] 選択されたパスを `String` として返す

## 2. Rust バックエンド: タスク一覧取得コマンド

- [x] `list_tasks` Tauri コマンドを実装する
- [x] 引数で受け取ったディレクトリパス内の `.md` ファイルを列挙する
- [x] 各ファイルについて:
  - ファイル名（拡張子除く）を `title` に
  - frontmatter の `status` をパース（デフォルトは `todo`）
  - body を残りのテキストとして抽出
- [x] `Vec<Task>` を JSON として返す

## 3. Rust バックエンド: ステータス更新コマンド

- [x] `update_task_status` Tauri コマンドを実装する
- [x] 引数: ファイルパス、新しいステータス値
- [x] ファイルの frontmatter をパースし、`status` フィールドを書き換える
- [x] ファイルに書き戻す

## 4. React: DirectoryPicker コンポーネント

- [x] アプリ起動時に表示されるディレクトリ選択画面
- [x] 「作業ディレクトリを選択」ボタン → `select_directory` を呼ぶ
- [x] 選択後、選択されたパスを親に通知する

## 5. React: Board / Column / Card コンポーネント

- [x] `Board`: 3 カラム（Todo / Doing / Done）を横並びに表示
- [x] `Column`: カラムヘッダー + カードのリスト
- [x] `Card`: タイトル + body の先頭数行を表示
- [x] カードクリックでステータス変更メニューを表示

## 6. React: アプリ全体のデータフロー

- [x] `App.tsx` でディレクトリ選択状態とタスクリスト状態を管理
- [x] ディレクトリ未選択 → `DirectoryPicker` を表示
- [x] ディレクトリ選択済み → `Board` を表示し、`list_tasks` でタスク取得
- [x] ステータス変更時 → `update_task_status` を呼び出し、タスクリストを再取得
