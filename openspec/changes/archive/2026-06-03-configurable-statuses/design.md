# Design: 設定で任意のステータスを定義できるようにする

## データモデル

### 設定の形式

既存の `settings.json`（`tauri-plugin-store`）に `"statuses"` キーを追加する。

```typescript
// settings.json に保存されるデータ構造
{
  "workspace_dir": "/path/to/dir",
  "statuses": [
    { "label": "Todo" },
    { "label": "Doing" },
    { "label": "Done" }
  ]
}
```

- ステータスはラベルのみを持つ（`id` なし）
- ラベル自体が識別子となる
- Markdown の frontmatter には `status: <label>` として保存される（例: `status: "In Progress"`）

### デフォルト値

設定が未定義の場合のデフォルト値:

```typescript
const DEFAULT_STATUSES = [
  { label: "Todo" },
  { label: "Doing" },
  { label: "Done" },
];
```

### カラムの色割り当て

ラベルには色情報がないため、固定のカラーパレットから順番に割り当てる。現在の 3 色に加え、拡張可能なパレットを用意する。

```typescript
const STATUS_COLORS = [
  "bg-gray-600",
  "bg-blue-600",
  "bg-green-600",
  "bg-yellow-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-indigo-600",
  "bg-red-600",
  "bg-teal-600",
];
```

## アーキテクチャ

### データフロー

```
[SettingsPanel] ──save──→ [tauri-plugin-store (settings.json)]
     │                          │
     │                     [statuses key]
     │                          │
     └──load──→ [App.tsx] ──→ [Board / Column / Card]
```

1. **アプリ起動時**: `get_statuses` コマンドで Store からステータス設定を読み込む
2. **未設定の場合**: デフォルト値（`Todo` / `Doing` / `Done`）を使用
3. **設定変更時**: `save_statuses` コマンドで Store に保存し、Board を再レンダリング
4. **Board レンダリング**: ステータス設定に基づいて動的にカラムを生成
5. **Card の Move to**: 設定されたステータスから現在のステータスを除外したものを表示

### Rust 側の変更

```rust
// 新しい Tauri コマンド

#[tauri::command]
fn get_statuses(app: tauri::AppHandle) -> Vec<StatusEntry> {
    // Store からキー "statuses" を読み込む
    // なければ空の Vec を返す
}

#[tauri::command]
fn save_statuses(app: tauri::AppHandle, statuses: Vec<StatusEntry>) -> Result<(), String> {
    // Store にキー "statuses" で保存
}

// 新しいデータ型
#[derive(Serialize, Deserialize)]
struct StatusEntry {
    label: String,
}
```

`update_task_status` と `replace_frontmatter_status` は引き続き任意の文字列を受け付けるため、Rust 側の変更は最小限。

### Frontend 側の変更

#### `src/types.ts`

```typescript
export interface StatusEntry {
  label: string;
}

export interface Task {
  id: string;
  title: string;
  status: string;    // union から string に変更（任意のステータス値を受け付ける）
  body: string;
}
```

#### `src/App.tsx`

- `invoke<StatusEntry[]>("get_statuses")` でステータス設定を読み込む
- 空の場合はデフォルト値を使用
- Board に `statuses` を props として渡す

#### `src/Board.tsx`

- `COLUMNS` 定数を削除し、props で受け取った `statuses` から動的にカラムを生成
- 色は `STATUS_COLORS` パレットからインデックスで割り当て

#### `src/Card.tsx`

- `STATUSES` 定数を削除し、props で受け取った `statuses` を使用
- `statusLabel` 関数は不要になる（ラベルがそのまま表示名）

#### `src/Column.tsx`

- 変更なし（すでに props で受け取った title と color を表示するのみ）

#### `src/SettingsPanel.tsx`

- ステータス一覧を表示・編集する UI を追加
  - 各ステータスのラベルをインライン編集可能
  - 「追加」ボタンで新しいステータス行を追加
  - 各行に「削除」ボタン
  - ドラッグまたは上下ボタンで順序変更
- 「保存」ボタンで `invoke("save_statuses", { statuses })` を呼び出し
- 保存後、親コンポーネントに変更を通知して Board を再レンダリング

### カラムの色割り当てロジック

```typescript
const columnColor = STATUS_COLORS[index % STATUS_COLORS.length];
```

## 変更箇所一覧

| ファイル | 変更内容 |
|----------|----------|
| `src-tauri/src/lib.rs` | `StatusEntry` 構造体追加、`get_statuses` / `save_statuses` コマンド追加 |
| `src/types.ts` | `StatusEntry` インターフェース追加、`Task.status` を `string` に変更、`Status` 型削除 |
| `src/App.tsx` | statuses 状態管理の追加、Board に props として渡す |
| `src/Board.tsx` | ハードコードされた `COLUMNS` を削除、動的生成に変更 |
| `src/Card.tsx` | ハードコードされた `STATUSES` を削除、props で受け取った statuses を使用 |
| `src/SettingsPanel.tsx` | ステータス編集 UI の追加 |

## 注意点

- `biome check` 通過のため、未使用の import や変数は適切に削除する
- `tsc` の `noUnusedLocals` / `noUnusedParameters` に注意
- デフォルト値を空にすると Board が空になるので、必ずフォールバックを用意する
- ステータス削除時に、そのステータスを持つタスクは孤立するが、今回は対応しない（非目標）
