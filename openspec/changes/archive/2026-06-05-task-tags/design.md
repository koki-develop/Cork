## Context

Cork のタスクモデルは現状 `title` / `status` / `body` / `order` の 4 軸のみ。ステータスはカラム分割という「主軸」を担うため 1 タスク 1 ステータスだが、利用者は副次的に「種別」「優先度」「領域」などの多軸ラベルでタスクを束ねたいシーンが多い。Markdown ファイルでの可搬性を保ったまま、Obsidian / Notion / GitHub Issues などとも親和性が高い `tags: [string]` を frontmatter に導入する。

現状の関連実装:
- `Task` 型: Rust 側 `src-tauri/src/task.rs::Task`、TypeScript 側 `src/types/task.ts::Task` の 2 箇所
- frontmatter 操作: `src-tauri/src/frontmatter.rs` の `parse` / `update` / `serialize`。`json_to_yaml` は既に `Value::Array` を `Yaml::Array` に変換でき、`serde_json` の string 配列はそのまま YAML フローシーケンスとして書き出される
- Tauri コマンド: `list_tasks` / `get_task` / `create_task` / `update_task` / `update_task_status` / `update_task_order` / `delete_task`
- ボード UI: `KanbanCard.tsx` がカード描画、`TaskDetailDialog.tsx` が編集ダイアログ
- 楽観的更新: `useWorkspace` フックの `setTasks` 経由

## Goals / Non-Goals

**Goals:**
- frontmatter キー `tags` に文字列配列を保存し、`list_tasks` / `get_task` で読める
- `create_task` / `update_task` でタグを更新できる
- `update_task` の `tags` パラメータは「未指定 = 維持」「明示空配列 = タグ削除」「明示配列 = 完全置換」を区別する (= patch ではなく set セマンティクス、`Option<Vec<String>>` でモデル化)
- ボード上のカードにタグを視覚的に表示する (混雑回避のため最大 3 個 + `+N` overflow)
- 詳細ダイアログ・新規作成ダイアログの両方でチップ + 入力欄 UI で追加/削除できる (`TagEditor` molecule を共通利用)
- キーボードのみで完全に操作できる (Enter で追加、Backspace で末尾削除、Tab で次フィールド)
- 既存ファイルに `tags` キーが無い場合は空配列扱いとし、後方互換を保つ
- 既存 spec (`task-detail-dialog`, `backend-update-task`) に MODIFIED 形式で要件追加

**Non-Goals:**
- タグでのフィルタ / 検索 UI — 別 capability として後続
- タグ毎の色付け / カスタマイズ — 全タグ均一スタイル
- タグの workspace 横断的な管理画面 (`.cork.json` への候補リスト永続化など)
- タグの最大個数 / 最大文字数の厳密なバリデーション (UX として空文字と前後空白除去のみ実施)
- `list_tasks` の tags フィルタリング API
- タグの並び替え DnD (今回はソート順 = 入力順を維持)

## Decisions

### `tags: Option<Vec<String>>` を `update_task` パラメータに採用 (patch ではなく set セマンティクス)

`update_task` は既に `title` / `status` / `body` を `Option<T>` で受け取り「未指定なら現状維持、指定なら上書き」のセマンティクスを採用している。`tags` も同じ形にする。

| アプローチ | 判断 |
|---|---|
| `tags: Option<Vec<String>>` (set) | **採用**。既存の他フィールドと一貫。「タグ全消し」は `Some(vec![])` で表現可能。フロントエンドは編集対象だけ送る既存パターンと完全互換。 |
| `add_tags` + `remove_tags` の差分指定 | 不採用。API 表面積が増え、結果整合性のハンドリングが複雑になる。タグ集合は小さく全置換のコストは無視できる。 |
| `tags: Vec<String>` (常に必須) | 不採用。「タグだけ別フィールドの変更を保護」できなくなる (例: 別ユーザがファイル直編集して追加したタグを上書きしてしまう)。frontend 側で常に full list を保持していれば実害は小さいが、`Option` パターンとの整合性を優先する。 |

### frontmatter での `tags: []` (空配列) はキーごと出力しない

タグが空の場合に `tags: []` を YAML に書き出すと、新規タスク / タグを 1 度も使ったことが無いタスクすべてに 1 行ノイズが入る。Cork は frontmatter の最小性を重視しているため、`update_task` 内で「空配列はキー除去」をハンドリングする。

| アプローチ | 判断 |
|---|---|
| 空配列はキー除去 | **採用**。frontmatter ノイズ最小。`#[serde(default)]` で読み戻し時にキー欠落 = 空配列となり対称。 |
| 常に `tags: []` を出力 | 不採用。ノイズ。 |
| `tags: null` を出力 | 不採用。null と空配列の意味論の混乱を招く。 |

実装は `frontmatter::update` の `(&str, Value)` ペア構築側で空配列なら push しない + 既存キーがあれば削除する形にする。既存 `update` ヘルパーには「キー削除」機能が無いので、新しいヘルパー `remove_keys(content, &["tags"])` か、`update` の API を `Value::Null` を「キー削除指示」と解釈するよう拡張する。**前者 (`remove_keys` を新設)** を選ぶ — `update` の意味論を `Null` で歪めない。

### `Task` 型のフロントエンド表現は常に `string[]` (null / undefined を許さない)

| アプローチ | 判断 |
|---|---|
| `tags: string[]` (常に配列) | **採用**。レンダリング側のガード (`task.tags?.length`) が不要、テストもシンプル。Rust 側は `#[serde(default)]` で空配列をデフォルトとし、ワイヤープロトコルでは常に配列が来る前提。 |
| `tags: string[] \| null` | 不採用。`null` 区別のためだけに毎度 nullish チェックが要る。frontmatter の `tags: null` は Rust 側で空配列に正規化する。 |
| `tags?: string[]` (optional) | 不採用。同上。 |

### タグ表示は最大 3 個 + `+N` overflow (KanbanCard)

ボードのカードは横幅 ~256px。一般的なタグ (英単語 1-2 個) は 3 個並べると概ね 1 行を満たす。タグ数が多いタスクで縦方向に伸びるとボード全体が崩れるため、ハード上限を設ける。

| アプローチ | 判断 |
|---|---|
| 最大 3 個 + `+N` チップ | **採用**。多くのカンバンツール (GitHub Projects, Linear, Jira) と同等。詳細はダイアログで確認できる。 |
| 全部表示 (折り返し) | 不採用。カード高さが揃わずボードのリズムが崩れる。 |
| 表示しない (アイコン + 数のみ) | 不採用。一覧から内容が分からないと意味が薄い。 |

### タグエディタは「チップ + 末尾入力」のコンビ UI (TaskDetailDialog)

入力経験はモダンなタグ入力で広く採用されている「pill input」パターンに準拠する:

- 既存タグは丸み付きチップ (× アイコン付き) として横並び
- 末尾に常時 1 つの `<input>` (placeholder: "Add tag…")
- 入力中に Enter / カンマ / blur (非空) でチップ化
- 空入力時の Backspace で最右チップを削除 (確認モーダル無し)
- 入力中の Escape で入力欄をクリア、もう一度 Escape でダイアログを閉じる (Modal の挙動)
- 重複タグは silent ignore (toast 等は出さず、入力欄だけクリアする)
- 前後の空白は trim
- IME 変換中 (`e.isComposing` または `e.keyCode === 229`) の Enter は無視

| 代替 | 不採用理由 |
|---|---|
| カンマ区切りテキストフィールド | 個別削除しづらい、視認性が低い |
| 別画面のタグ管理 UI | カード内編集が分断され、Body と同時編集ができない |
| 全タグから複数選択するセレクトボックス | workspace 横断のタグ候補管理が前提となるが、本 change では候補保存を導入しない |

### `CreateTaskDialog` でも `TagEditor` を再利用する (新規作成時点でのタグ設定)

新規作成ダイアログでもタグを入力できるようにする。詳細ダイアログと同じ `TagEditor` を再利用することで挙動を統一する。

- ダイアログ内のローカル state `tags: string[]` (初期値 `[]`) を保持
- 送信時 (`handleSubmit`) に未確定の入力欄値があれば自動で flush (`TagEditor.flush()`) してから `tags` 配列を確定
- `onCreateTask(title, status, body, tags)` で親に渡し、`createTask` の API ラッパーに `tags` を渡す
- `prevOpenRef` ベースの reset で `tags` も `[]` に戻す
- 詳細ダイアログと違い「追加/削除のたびの即時保存」は不要 (まだファイルが存在しない)。すべて submit 時にまとめて create される

### 保存タイミング (詳細ダイアログ) は「即時 + close-time flush」のハイブリッド

`TaskDetailDialog` の他フィールドは:
- `title` / `body` → blur で保存、close 時に dirty なら flush
- `status` → onChange で即時保存

タグは追加/削除がアトミックなアクション (チップ追加・削除自体が「保存意図のあるユーザ行動」) なので、各操作直後に `update_task({ tags })` を呼ぶ。close 時の flush は「入力欄に未確定の文字列が残っている場合」をカバーするためだけに走る (= blur と等価の処理)。

| アプローチ | 判断 |
|---|---|
| 即時 + close-time flush | **採用**。直感的で、楽観的更新でレスポンスも良い。 |
| 全部 blur 保存 | 不採用。チップ操作の度に保存意図はあるので、blur まで待つのは遅延感が出る。 |
| ダイアログ閉じるまで未保存 | 不採用。他フィールドのセマンティクスと不整合。 |

### モーレキュール `TagList` / `TagEditor` を新設

`atoms/Badge` は固定サイズ (`size-5`) の数値バッジ用で再利用しづらい。タグは可変幅・テキスト中身があるため、`molecules/Tag` 単体 atom ではなく、リスト/エディタの責務を持つ molecules を 1 ペア追加する。

- `molecules/TagList.tsx` — `tags: string[]`, `maxVisible?: number` (default 3) を受け取って表示専用チップ列をレンダ
- `molecules/TagEditor.tsx` — `tags`, `onChange(next: string[])` を受け取り、入力 + 編集を制御 (controlled component)

両方とも視覚スタイルは同じチップを使うため、内部の `Chip` を `TagList` 内のローカルコンポーネントとして共有、または `atoms/TagChip` を最小 atom として 1 枚切り出してもよい。**実装時に `atoms/TagChip` を追加する** — 「表示 1 個分のチップ」は単一責務として小さく、他の場所 (将来のフィルタバーなど) でも再利用可能。

### スタイル決定 (Cork デザイントークン準拠)

- チップ容器: `inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs`
- 背景/枠線: `bg-cork-elevated/60 border border-cork-border/40`
- テキスト: `text-cork-muted` (本文より控えめ。タイトル/Status を主役に保つ)
- ホバー (編集モード): 枠線を `border-cork-border/70`、削除 × ボタンを `opacity-100` に
- 削除 × アイコン: `lucide-react` の `X` を `size-3` で。aria-label="Remove tag {tag}"
- overflow `+N` チップ: 同じスタイル、`text-cork-muted` のまま
- 編集入力欄: チップ列と同じ高さ (`h-5`)、`bg-transparent border-none outline-none px-1 text-xs min-w-[60px]`、placeholder `text-cork-muted/50`

アクセシビリティ:
- 削除ボタンは `<button type="button" aria-label="Remove tag {label}">` の独立ボタン (Enter / Space で発火)
- タグリスト全体は `role="list"` 不要 (装飾的、screen reader は要素を順に読む)
- 入力欄に `aria-label="Add tag"`
- duplicate 入力時に visual hint なし (silent ignore) だが、`<input>` の値はクリアして「受け付けたが消えた」のを認知させる

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `tags` を持つ既存ファイルが (Obsidian 等で) 別の意味 (string 単体 / 別形式) で書かれている可能性 | `#[serde(default)]` + `Vec<String>` の deserialize は string 配列以外 (例: `tags: "foo"`) で失敗する。task.rs の `TaskFrontmatter` を緩く受け取る (`#[serde(default, deserialize_with = "deserialize_tags_lenient")]`) ようにし、不正型なら空配列扱いとする方針。代替として「frontmatter 全体のパース失敗 → タスク無視」が現状なので、`tags` 単体の失敗で全体を落とすのを避ける。 |
| 多数のタグ + 長いタグ名でカードが破綻 | KanbanCard 側で `truncate` + max-width をチップに適用。+N overflow が早めに出る前提でレイアウト崩れを抑える。詳細ダイアログでは折り返し許可。 |
| 即時保存 (チップ追加削除毎) の race | チップ操作はユーザのアトミックな意図で、間隔が短くてもタスクごとに直前の操作で得た楽観的 state を次の `update_task` に投入する形なので問題なし。`update_task` 自体が full set セマンティクスなので部分マージのズレが起きない。 |
| IME 変換中の Enter で意図しないタグ化 | `onKeyDown` で `e.nativeEvent.isComposing` を見て早期 return。React 19 の SyntheticEvent でも nativeEvent 経由で取得可能。 |
| YAML へのシリアライズで特殊文字 (`:` `[` 等) を含むタグが壊れる | `yaml_rust2` の `YamlEmitter` は文字列をクオートして安全にエスケープする (frontmatter::serialize で実装済み)。既存テストパターンに沿ってラウンドトリップテストを追加。 |
| 空配列でキー除去するロジックの追加で frontmatter.rs の API が肥大 | `remove_keys(content, &[&str])` を 1 関数追加するだけ。既存 `update` と対称的な API で複雑度は低い。 |
| `+N` overflow チップをクリックしてもダイアログが開く ≠ 直接全タグが見えるわけではない (UX 期待のミスマッチ) | KanbanCard 自体クリックで詳細ダイアログ → Tags フィールド全表示と同等なので、`+N` クリックでカードクリックがバブルするだけで十分。Tooltip 等は v2 で検討。 |
| 新規タスクにタグを付けたいユースケースが詳細ダイアログまで遡る必要がある | Non-goal として明示。`task-tags-create` 等の後続 change で `CreateTaskDialog` に追加する余地を残す。 |

## Migration Plan

データ移行は不要。後方互換性が完全に保たれる:

1. デプロイ後、既存 `.md` ファイルには `tags` キーが無い → Rust 側 `#[serde(default)]` で空配列が返る → フロントは空配列をレンダ (= 何も表示しない) → 振る舞いの差分なし
2. ユーザが詳細ダイアログでタグを追加 → `update_task` 呼び出し → 該当ファイルにのみ `tags: [...]` が書き加わる
3. ユーザが全タグを削除 → `tags` キーが除去された frontmatter に戻る

ロールバック:
- 旧バージョンに戻しても、frontmatter の余分な `tags:` キーは `TaskFrontmatter` の deserialize で **無視される (struct に該当フィールドが無いキーは serde が落とす)** ため、タスクが読めなくなる事故は起きない。
- 旧バージョンでファイルを再書き出し (例: status 変更) すると `tags` キーは drop されるため、ロールバック中の編集で「タグが消える」可能性はある。これは "1 way migration" として許容する (Markdown ファイル直接編集との並存運用と同程度のリスク)。

## Open Questions

- なし。タグ機能の最小スコープ (frontmatter 配列 + 表示 + 編集) は本 change で完結する。フィルタ / 候補補完 / 色付け / 一括編集などは後続の独立した change として扱う。
