## Context

現在のタスク並び順は alphabetical sort (`tasks.sort_by(|a, b| a.title.cmp(&b.title))`) で固定されている。`@dnd-kit/react` の `useSortable` により UI 上の並び替え（ドラッグ&ドロップ）は可能だが、`handleDragEnd` ではカラム移動時の `status` 更新のみを永続化しており、同一カラム内の順序変更は無視される。また frontmatter には `order` フィールドが存在せず、`replace_frontmatter_status` は既存の frontmatter を全て破棄して `status` だけを書き込む実装になっている。

## Goals / Non-Goals

**Goals:**
- frontmatter に `order: <float>` フィールドを追加し、タスクの表示順を永続化する
- 同一カラム内（intra-column）のドラッグ&ドロップ並び替えを有効化し、新しい順序を frontmatter に保存する
- カラム間移動時（cross-column）も移動先の適切な位置に挿入された順序を保存する
- `order` がない既存のタスクは alphabetical sort で後方互換を保つ
- frontmatter の全フィールド（`status` など）を保持しながら `order` を追記・更新できる

**Non-Goals:**
- カラムの並び順への影響（カラム順は既に `settings.json` の `statuses` 配列順で永続化済み）
- タスクの一括リナンバリング（毎回 0 からの連番を割り当てる）
- Markdown ファイルのリネームや移動
- UI 上の明示的な「順序リセット」操作

## Decisions

### 1. 並び替え戦略: Fractional Indexing（小数による中間挿入）

**決定**: タスクの order 値には `f64` の小数を使用し、ドラッグ&ドロップ時には前後のタスクの order の中間値を割り当てる。これにより、移動したタスク1ファイルのみを書き換えればよく、カラム内の全ファイルを書き直す必要がない。

**理由**: Done カラムのようにタスクが増え続けるカラムでも、挿入1回につき1ファイルの書き込みで済むため O(1) でスケールする。`f64` の仮数部は53ビットあるため、初期値 0.0 / 1.0 から始めて約53回の中間挿入を耐えられる。稀に精度が尽きた場合のみカラム全体のリナンバリング（`renumber_tasks`）が発生するが、実用上ほとんど起こらない。

**代替案との比較**:
- カラム全体リナンバリング（`update_tasks_order(paths: Vec<String>)`）→ Done が数千でも毎回全ファイル書き換えで非効率
- Lexorank（文字列による辞書順 order）→ 理論上は無限だが実装が複雑で frontmatter の可読性が低い

### 2. Rust コマンド: `update_task_order` + `renumber_tasks`

**決定**: 以下の2つの Tauri コマンドを追加する。

**`update_task_order(path: String, order: f64)`**:
- 単一のタスクの order 値を更新する
- フロントエンドが前後のタスクの order から中間値を計算して渡す
- path の workspace 内検証を行い、frontmatter の order を書き換える

**`renumber_tasks(paths: Vec<String>)`**:
- カラム内の全タスクを 0.0, 1.0, 2.0, ... にリナンバリングする
- `update_task_order` で精度が不足した場合のフォールバック
- フロントエンドで `(prev_order + next_order) / 2 === prev_order` または `=== next_order` になった時に呼び出す

**理由**: 99.9% のケースでは `update_task_order`（1ファイル書き込み）で済む。`renumber_tasks` は稀なフォールバックであり、初期状態（全タスクに order が未設定）からの初回ドラッグ時にも使用する。

### 3. Frontmatter 更新: `serde_json::Value` で全フィールドを保持

**決定**: `gray_matter::Matter::<YAML>::new().parse::<serde_json::Value>()` で frontmatter を汎用 JSON オブジェクトとしてパースし、`order` フィールドを追加/更新した後、`Matter::stringify()` または `serde_yaml::to_string()` でシリアライズする。これにより `status` など未知のフィールドも保持される。

**理由**: 現在の `replace_frontmatter_status` は frontmatter 全体を `---\nstatus: {new}\n---` で上書きしてしまい他のフィールドが失われる。`serde_json::Value` を使えば型に依存せず任意のフィールドを扱える。

**依存追加**: `serde_yaml` を Cargo.toml に追加（`gray_matter` が内部的に使用しているが公開依存として追加）。

### 4. Intra-column 並び替えの検出と永続化

**決定**: `useBoardDragState` の `handleDragEnd` 内で、ドロップされたタスクの新しい位置の前後のタスクから order の中間値を計算し、`update_task_order(path, newOrder)` を呼び出す。中間値が前後いずれかと等しい（精度不足）場合は、事前に `renumber_tasks(paths)` で該当カラムをリナンバリングしてから再計算する。

**実装イメージ**:
```typescript
function calculateMidpoint(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0.0;
  if (prev === null) return next! / 2.0;
  if (next === null) return prev + 1.0;
  return (prev + next) / 2.0;
}

// handleDragEnd 内（card type の処理を拡張）
if (source.type === "card") {
  const taskId = String(source.id);
  const newStatus = Object.entries(tasksByColumn).find(([, ids]) =>
    ids.includes(taskId),
  )?.[0];
  const task = tasksById.get(taskId);

  if (newStatus && task && task.status !== newStatus) {
    await onTaskStatusUpdate(taskId, newStatus);
  }

  // 移動先の前後のタスク ID を取得
  const columnIds = tasksByColumn[newStatus ?? task!.status];
  const idx = columnIds.indexOf(taskId);
  const prevTask = idx > 0 ? tasksById.get(columnIds[idx - 1]) : null;
  const nextTask = idx < columnIds.length - 1 ? tasksById.get(columnIds[idx + 1]) : null;

  let newOrder = calculateMidpoint(prevTask?.order ?? null, nextTask?.order ?? null);

  // 精度不足ならリナンバリング
  if (newOrder === prevTask?.order || newOrder === nextTask?.order) {
    await onRenumberTasks(columnIds);
    // リナンバリング後、改めて中間値を計算
    const updatedPrev = /* リナンバリング後の order を再取得 */;
    const updatedNext = /* ... */;
    newOrder = calculateMidpoint(updatedPrev, updatedNext);
  }

  await onTaskOrderUpdate(taskId, newOrder);
}
```

**初回ドラッグ時の注意**: 既存のタスクはすべて `order: null` のため、初回ドラッグ時は `renumber_tasks` で全タスクを 0.0, 1.0, 2.0, ... に初期化してから中間値を計算する。

### 5. `order` のソート順

**決定**: `list_tasks` 内のソートを `order` 昇順 → `title` 昇順（fallback）に変更する。`order` がないタスクは `order: INF` として扱い、ordered タスクの後ろに alphabetical で表示する。

**理由**: 一度並び替えをしたタスクと未設定のタスクが混在する場合、ordered なタスク群を先頭に、未設定のタスクを後方に alphabetical でまとめるのが自然。

**実装**:
```rust
tasks.sort_by(|a, b| {
    let a_order = a.order.unwrap_or(f64::MAX);
    let b_order = b.order.unwrap_or(f64::MAX);
    a_order
        .partial_cmp(&b_order)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.title.cmp(&b.title))
});
```

### 6. 型定義の変更

**決定**: TypeScript の `Task` 型に `order: number | null` を追加し、Rust の `Task` 構造体に `order: Option<f64>` を追加する。

```typescript
// types/index.ts
export interface Task {
  id: string;
  title: string;
  status: string;
  body: string;
  order: number | null;
}
```

```rust
// lib.rs
struct Task {
    id: String,
    title: String,
    status: String,
    body: String,
    order: Option<f64>,
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `serde_yaml` の追加依存でバイナリサイズ増加 | `gray_matter` が既に依存しているため増加は最小限。`Matter::stringify()` の内部も `serde_yaml` を使用 |
| frontmatter のコメントや書式が失われる可能性 | `gray_matter` + `serde_yaml` の再シリアライズにより YAML の再フォーマットは発生するが、コメントなど意味論に影響しない要素の欠落は許容 |
| `f64` の精度限界による予期せぬリナンバリング | 53回の中間挿入に耐える。実運用で同一カラム内の隣接タスクを53回連続で移動することは稀。リナンバリングが発生しても1カラム分の書き込みで完了 |
| 複数タブ/ウィンドウでの競合 | ファイル単位の書き込みで、最後に書き込んだ方が優先される。楽観的更新＋ファイル監視による再読込で対応 |
