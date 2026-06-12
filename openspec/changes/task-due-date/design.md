## Context

Cork のタスクは frontmatter に `status` / `order` / `tags` を持つが、期日の概念がない。本変更でタスクに「期日」を一つ持たせ、ボード上で締め切りの近さ・超過を可視化する。

既存の `tags`（`Option<Vec<String>>` を Keep / Set / Clear の 3 状態で扱う設計）が `date` 実装のほぼ完全な参照モデルになる。`update_task` のタグ処理、`computeDirtyUpdates`、`TagEditor` + `TagSuggestionPopover`（ポータルでダイアログ top layer に出すポップオーバー）といったパターンをそのまま日付向けに踏襲する。

制約:

- このコードベースは日付ライブラリ未導入で、`Select` 等の UI も自作している。カレンダーも自作する（ユーザー確認済み）。
- 日付は **日付のみ**（`YYYY-MM-DD`、時刻なし）（ユーザー確認済み）。
- frontmatter のシリアライズは独自実装（`frontmatter::serialize` → `yaml-rust2` の `YamlEmitter`）。`Yaml::String("2026-06-15")` を emit したときにクォートされず、再パース時に YAML の date 型として解釈されないか確認が必要。
- 期日は MCP `list_tasks` 出力にも含める（ユーザー確認済み）。

## Goals / Non-Goals

**Goals:**

- frontmatter `date`（`YYYY-MM-DD` 文字列）でタスクに期日を 1 つ保持する。
- 作成 / 詳細ダイアログで、フォーカス時にカレンダーがポップアップする入力欄から、選択・直接入力・クリアができる。
- Kanban カードに、今日からの相対距離に応じたラベル + 色で期日を表示する。
- `tags` と一貫した Keep / Set / Clear セマンティクスで `update_task` を実装する。
- MCP `list_tasks` の各タスクに `date` を含める。
- 既存タスク（`date` 無し）は「期日なし」として無変更で動作する（後方互換）。

**Non-Goals:**

- 時刻 / タイムゾーン / 繰り返し / リマインダー。
- 期日によるソート・フィルタリング・ボードのグルーピング（将来課題）。
- 開始日〜終了日のような期間（範囲）。単一の期日のみ。
- 複数日付フィールド（`created` / `updated` 等の自動メタデータ）。

## Decisions

### 1. frontmatter は `date: YYYY-MM-DD` を**文字列**として保持する

YAML には date スカラ型が存在し、`yaml-rust2` の emitter が `2026-06-15` をクォートせず出力すると、再読み込み時にパーサが date 型として解釈し得る。一方 `TaskFrontmatter.date` は `Option<String>` で受けるため、文字列として安定的にラウンドトリップさせたい。

- 採用: `frontmatter::serialize` は値を `serde_json::Value::String` として渡す。`yaml-rust2` は `2026-06-15` のような曖昧文字列をクォートして emit する挙動（要 round-trip テストで pin）。さらに serde 側は `Option<String>` で受けるため、YAML が date 型ではなく string として渡ってくることをテストで保証する。
- 値の正準形は常に `YYYY-MM-DD`（ゼロ埋め月日）。これ以外の形（`2026-6-5`、`2026/06/15`、date 型、非文字列）は「期日なし」にフォールバックする lenient deserialize を `deserialize_tags_lenient` と同様に実装する（`deserialize_date_lenient`）。これにより手書き frontmatter の表記ゆれや YAML date 型でもファイル全体が壊れない。

### 2. `update_task` は `tags` と同じ 3 状態を空文字センチネルで表現する

`date: Option<String>` を取り、`None` = Keep（既存維持）、`Some("")` = Clear（キー削除）、`Some(valid)` = Set。これは `tags` の `None` / `Some([])` / `Some([...])` と完全に対称。

- Clear 時は `frontmatter::remove_keys(content, &["date"])` でキーを物理削除する（`tags` の Clear と同じ）。
- Set 時は `fm_updates` に `("date", json!(value))` を push。
- `DateOp { Keep, Set(String), Clear }` enum と分類関数 `classify_date_arg(Option<String>) -> CmdResult<DateOp>` をモジュールスコープに置き、create 経路（`write_task_file` が呼ぶ `normalize_date_arg`）と update 経路（`update_task`）が**同一の検証ゲート**を共有する。None/空/正準形の分類と不正時のエラーメッセージが 1 箇所に集約され、両経路で受理基準がドリフトしない。
- Set 時の値はバックエンドでも `YYYY-MM-DD` 妥当性を検証し、不正なら `CommandError`（フロントは妥当値しか送らないが防御的に）。
- 代替案: `date: Option<Option<String>>`（`Some(None)` = Clear）も検討したが、JSON / invoke 経由で `tags` と表現がずれ、フロント `TaskUpdates` の `computeDirtyUpdates` パターンから外れるため不採用。空文字センチネルで `tags` と統一する。

**フロント側の型戦略（clear センチネルの一貫性）**: ドメイン型 `Task.date` は `string | null`（`null` = 期日なし、API の素直な表現）とする。一方、フォーム状態とダイ差分計算では `tags`（`string[]`、`[]` = なし/clear）と完全対称にするため `string`（`""` = 期日なし/clear）で扱う:

- `TaskFormSnapshot.date: string` — フォーム初期化時に `task.date ?? ""` で seed（`null` → `""`）。
- `computeDirtyUpdates` は `current.date !== original.date` のとき `updates.date = current.date` を出す。値が `""` なら Clear、正準形なら Set がそのまま wire に乗る（追加変換不要）。
- `withTaskUpdates` / `revertField` / `withFieldReverted` も `string` で一貫。
- これにより null↔"" の変換点は「`Task` → フォーム seed」の 1 箇所のみに閉じ、`tags` と同一構造になる。

### 3. 日付ロジックは純粋関数 `lib/date.ts` に集約する

`YYYY-MM-DD` ⇄ ローカル `Date` の変換、相対カテゴリ判定、表示ラベル生成を React / Tauri 非依存の純粋関数にまとめる。`lib/` の「React なし・Tauri なし」規約に合致し、ロジックを単体で検証できる。

提供する関数（概略）:

- `parseDate(s: string): Date | null` — 厳密な `YYYY-MM-DD` のみ受理（範囲外の月日も拒否）。**`new Date("2026-06-15")` は UTC 0:00 として解釈され、負の UTC オフセット地域ではローカルで前日にずれる罠があるため、必ず `new Date(y, m-1, d)`（ローカル 0:00）で構築する。**
- `formatISODate(d: Date): string` — ローカル日付を `YYYY-MM-DD` に（`getFullYear` / `getMonth` / `getDate` ベース、UTC メソッドは使わない）。
- `classifyDate(date: Date, today: Date): DateCategory` — `"overdue" | "today" | "tomorrow" | "soon" | "far"`。
- `formatRelativeLabel(date: Date, today: Date): string` — カテゴリに応じた表示文字列。

**相対カテゴリと表示の確定仕様**（ローカルカレンダー日で比較、`diff = 期日 - 今日`、単位は日）:

| カテゴリ   | 条件             | ラベル例        | 色トークン               |
| ---------- | ---------------- | --------------- | ------------------------ |
| `overdue`  | `diff < 0`       | 実日付 `Jun 5`  | danger 赤                |
| `today`    | `diff == 0`      | `Today`         | 緑（新トークン）         |
| `tomorrow` | `diff == 1`      | `Tomorrow`      | オレンジ（新トークン）   |
| `soon`     | `2 <= diff <= 6` | 曜日名 `Monday` | 紫（既存 `cork-accent`） |
| `far`      | `diff >= 7`      | 実日付 `Jun 20` | muted（`cork-muted`）    |

曜日名は `diff <= 6` までに限定する。`diff == 7` は今日と同じ曜日名になり曖昧なため `far` 扱いで実日付を出す。曜日名・月名は `toLocaleDateString`（`weekday: "long"` / `month: "short", day: "numeric"`）で生成し、ロケールは **`en-US` 固定**（ボードを言語に依らず英語表記で統一する）。実日付（overdue / far）は **期日の暦年が今日と異なる場合**に年も付与する（`getFullYear()` 比較、例 `Jun 5, 2027`）— 日数差ではなく暦年で判定するので、年末年始を跨ぐ近い日付でも年が出て取り違えを防ぐ。カテゴリ判定とラベル生成は `describeDate(date, today)` が `{ category, label }` を 1 度で返し、proximity の重複計算を避ける。なお DateBadge の文字色のうち today / tomorrow / overdue の 3 色は `/85` でわずかに抑える。

### 4. カレンダー / 日付入力 UI は atomic design に沿って 3 コンポーネントに分割する

- `molecules/Calendar`（新規）: 月グリッドを描画する表示 + 選択コンポーネント。`value: Date | null` / `onSelect(date)` / 月送り。`Date` のネイティブ計算のみで構築（依存追加なし）。月送りの表示 state を内部に持つため、「local state 禁止」の atoms ではなく molecules に置く（`TagEditor` → `TagSuggestionPopover` と同じ molecule→molecule 構成）。
- `molecules/DateField`（新規）: 入力欄 + `Calendar` ポップオーバー。`TagEditor` / `TagSuggestionPopover` と同じく、フォーカスでポップオーバーを開き、`createPortal` で最寄りの `<dialog>` top layer にマウントする（モーダル背景の上に出すため）。位置決めは既存の `useAnchorRect` を再利用。直接入力（`YYYY-MM-DD`）・カレンダー選択・クリア（×）に対応する。`onChange(date: string)` を返す（`""` = 期日なし、決定2の型戦略に合わせる）。**直接入力の確定タイミングは title フィールドと同じく blur 基準**: 入力テキストを `parseDate` で検証し、妥当なら正準形に正規化して `onChange`、不正なら直前の有効値（または `""`）に戻す。カレンダー選択時は即 `onChange` + ポップオーバーを閉じる。これにより詳細ダイアログの blur-save パターン（title / body と同じ）に自然に乗る。先頭のカレンダーアイコンは開閉トグルボタンを兼ね（閉じた後に再フォーカスせず再表示できる）、ポップオーバーは `motion/react` の `AnimatePresence` + `m.div` で開閉時にふわっとフェード/スケールさせる（`TagSuggestionPopover` と同じトランジション）。
- `molecules/DateBadge`（新規）: カード表示用。`date` 文字列を受け、`classifyDate` でカテゴリを判定し、アイコン + ラベルを出す。チップ（枠線・背景・ピル）ではなく**アイコン + 色付きテキストのみ**の軽い見た目で、色はカテゴリごとの文字色で表現する。

### 5. ダイアログとカードへの配線は既存パターンを踏襲する

- `CreateTaskDialog`: サイドバーの「Tags」の上に「Date」`FormField` + `DateField` を追加。`useState<string>("")` で保持（`""`=なし、DateField の型と一致）、`onCreateTask` のシグネチャに `date: string` を追加。`isDirty` 判定にも含める（`date !== ""`）。バックエンド `write_task_file` は `Some("")` を「date 出力なし」として扱うため、`""` をそのまま送って問題ない。
- `TaskDetailDialog` / `useTaskDialogState`: フォーム状態 `date` を追加。`tags` と同様に変更時 auto-save（`handleDateChange`）。`TaskFormSnapshot` / `computeDirtyUpdates` / `withTaskUpdates` / `revertField` / `withFieldReverted` の各所に `date` を編み込む。
- `KanbanCard`: タイトル直下、`TagList` の近傍に `DateBadge`（`date` があるときのみ）を表示。

### 6. テーマに期日色トークンを追加する

`today`（緑）と `tomorrow`（オレンジ）の文字色が `cork` テーマに無い。`style.css` の `@theme` に `--color-cork-success-text`（緑）と `--color-cork-warning-text`（オレンジ）を追加する。DateBadge はテキストのみ（背景・枠線なし）なので必要なのは文字色トークンだけ。`overdue` は既存 `cork-danger-text`、`soon` は既存 `cork-accent-hover`、`far` は既存 `cork-muted` を流用する。

### 7. MCP `McpTask` に `date` を追加し、`create_task` ツールも `date` を受け付ける

`McpTask` は `body` / `order` を落とした軽量 DTO だが `tags` は保持している。期日は LLM がタスク調整に使える文脈として有用なため `date: Option<String>`（未設定時は `null`）を追加する。`McpTask` はコード中の 3 箇所（`list_tasks` のマップ、`create_task` の出力、`delete_task` の出力）でインライン構築されているため、全箇所に `date` を写す（`task::Task.date` から）。`outputSchema` のスキーマ pin テスト（root が object）は維持され、フィールド追加は既存クライアントに非破壊。

加えて、MCP の `create_task` ツールにも GUI 作成ダイアログと対称な期日入力を持たせる。`CreateTaskInput` にオプショナルな `date: Option<String>` を追加する。ハンドラはまず `task::normalize_date_arg(input.date)` で日付を検証し、**不正な日付は `invalid_params`（クライアント入力エラー）** にマップする。正規化済みの値を `write_task_file` に渡し、そこから返る失敗（重複タイトル `DuplicateTask`・IO エラー等）は **`internal_error`** にマップする。こうして「不正な日付＝クライアント側で直せる」と「書き込み失敗＝サーバ/ディスク要因」を区別し、LLM が正しいリクエストを無駄に変形しないようにする。

なお現行の `mcp-server` spec は `list_tasks` ツールのみを要件化しており、`create_task` / `delete_task` / `list_statuses` / `list_tags` は spec 未記載（実装先行の既存ギャップ）。本変更ではスコープを広げて create_task 全体を文書化することはせず、本変更が加える差分（create_task が `date` を受け付ける）のみを ADDED 要件として最小限追加する。

## Risks / Trade-offs

- **[YAML date 型としての再解釈]** `yaml-rust2` が `2026-06-15` をクォートせず emit すると、再パースで string 以外に化ける懸念 → `frontmatter` の round-trip テスト（serialize → parse で `Option<String>` に正しく戻る）で pin し、必要なら lenient deserialize 側で YAML date 由来の値も `YYYY-MM-DD` 文字列として救済する。
- **[「今日」の境界とタイムゾーン]** 相対表示はローカルカレンダー日に依存し、日付をまたぐ瞬間に表示が変わる → 比較は常にローカル時刻の 0:00 正規化で行う。再レンダリングまで古い表示が残るのは許容（カードは操作時に再描画される）。
- **[手書き frontmatter の表記ゆれ]** `2026/6/5` 等の非正準表記は「期日なし」にフォールバックし、ユーザーの意図した期日が表示されない → 仕様として正準形 `YYYY-MM-DD` のみを期日として認識することを spec に明記。アプリ経由の書き込みは常に正準形。
- **[新規色トークン]** 緑・オレンジの追加でテーマのパレットが広がる → `cork-danger` と同じ三つ組命名・最小追加に留め、ダークテーマ前提のコントラストを確認。
- **[カレンダー自作の実装コスト]** 月グリッド・月送り・キーボード操作の自作はコスト増 → atomic 分割で `Calendar` を独立させ、`lib/date.ts` の純粋関数でロジックを切り出してテスト可能にする。

## Migration Plan

- 後方互換のため DB マイグレーション等は不要。`date` 未設定の既存ファイルはそのまま「期日なし」。
- フィールド追加のみのため MCP クライアントへの破壊的変更なし。
- ロールバック時も、書き込まれた `date` キーは無害な未知 frontmatter として残るだけで既存読み取りを壊さない。

## Open Questions

- なし（カレンダー実装・日付粒度・MCP 露出はユーザー確認済み。相対カテゴリの閾値・色割り当ては本 design で確定）。
