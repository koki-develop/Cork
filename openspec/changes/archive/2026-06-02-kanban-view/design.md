# Design: Markdown Kanban ビュー

## アーキテクチャ

```
┌──────────────────────────────────────────────┐
│               React Frontend                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Todo    │ │  Doing   │ │  Done    │      │
│  │  Column  │ │  Column  │ │  Column  │      │
│  └──────────┘ └──────────┘ └──────────┘      │
│        ▲            ▲            ▲            │
│        └────────────┼────────────┘            │
│                 Data Layer                    │
│        ┌──────────────────────────┐           │
│        │    useKanbanStore        │           │
│        │  (React context/hooks)   │           │
│        └──────────┬───────────────┘           │
└───────────────────┼──────────────────────────┘
                    │ Tauri Commands (invoke)
┌───────────────────┼──────────────────────────┐
│  ┌────────────────┴────────────────┐         │
│  │   Rust Backend (Tauri)          │         │
│  │  - list_md_files                │         │
│  │  - read_md_file                 │         │
│  │  - update_md_status             │         │
│  └─────────────────────────────────┘         │
└──────────────────────────────────────────────┘
```

## データモデル

### Markdown ファイルのフォーマット

```markdown
---
status: todo
---

ここにタスクの詳細を自由に記述する。
```

- **ファイル名**: タスクのタイトル (`<title>.md`)
- **frontmatter**: `status` フィールドのみ必須。値は `todo`, `doing`, `done` のいずれか
- **body**: タスクの詳細説明（Markdown 形式）

### タスクの型

```typescript
interface Task {
  id: string;        // ファイルパス（ユニーク識別子）
  title: string;     // ファイル名（拡張子除く）
  status: Status;    // "todo" | "doing" | "done"
  body: string;      // 本文（Markdown 文字列）
}
```

## コンポーネント構成

- `App.tsx` - ルート: 作業ディレクトリ選択 UI or ボード表示の切り替え
- `Board.tsx` - Kanban ボード全体: 3 カラムのレイアウト
- `Column.tsx` - 単一カラム: ヘッダー + カードリスト
- `Card.tsx` - 単一タスクカード: タイトル + body プレビュー表示
- `DirectoryPicker.tsx` - 初回起動時のディレクトリ選択画面

## Tauri コマンド

Rust 側で以下 3 つのコマンドを実装:

1. `select_directory` - ネイティブのディレクトリ選択ダイアログを開き、選択されたパスを返す
2. `list_tasks` - 指定ディレクトリ内の `.md` ファイルを全件読み込み、`Task[]` を返す
3. `update_task_status` - 指定ファイルの frontmatter `status` を書き換える

## 状態管理

シンプルな React の `useState` + props で管理（今回は外部ライブラリ不使用）。
Task リストは `list_tasks` で取得し、更新時は `update_task_status` を呼び出してから再取得する。

## ドラッグ & ドロップ

今回はドラッグ & ドロップは実装せず、カードをクリックするとステータス選択のポップアップメニューが出て、そこでステータスを変更する方式にする（最小実装）。
