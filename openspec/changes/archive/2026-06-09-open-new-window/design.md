## Context

Cork は現在、Tauri v2 のシングルウィンドウ構成で運用されている。`lib.rs::run()` の `setup()` で `"main"` というハードコードされたラベルの `WebviewWindow` を 1 個だけ生成し、`AppState` はプロセス全体で 1 つのワークスペースを `Mutex<Option<PathBuf>>` として保持する。バックエンドの全コマンド (`task::list_tasks`, `workspace::set_workspace_directory`, ...) はこの単一値を経由してファイルシステムを参照しているため、「どのウィンドウから呼ばれたか」という概念がそもそも存在しない。

ワークスペース履歴 (`workspace_history`) は既に `tauri_plugin_store` 経由で `settings.json` に永続化されている (最大 50 件、最近順、`set_workspace_directory` 呼び出しのたびに `prepend_unique_capped` で更新)。`get_workspace_directory` は state が空のときにこの履歴の先頭から `is_dir()` で生存確認しつつ初期ワークスペースを復元する仕組みを持つ。しかしこの復元は「起動時の最初の呼び出し」と「ウィンドウ生成時の自動セレクト」を兼ねており、将来複数ウィンドウを開く文脈では「新規ウィンドウが既存ウィンドウのワークスペースを意図せずクローンする」という不適切な挙動になる。

フロントエンドは `App.tsx` の `useCurrentDir()` で `getWorkspaceDirectory()` を一度だけ呼び、戻り値が `null` なら `WelcomePage`、そうでなければ `BoardPage` を描画する単純なルーティング。`WelcomePage` はロゴ + `Select Workspace Directory` ボタンの 1 アクション UI で、履歴を扱う UI は存在しない。

ファイル構成・依存ルールは `.oxlintrc.json` の `no-restricted-imports` overrides で機械的に強制されている (atoms → molecules → organisms → templates → pages の単方向 + `organisms/board` ⇔ `organisms/settings` の相互禁止)。新しいコンポーネントもこの規約に沿わせる必要がある。

Tauri capability ファイル (`capabilities/default.json`) は現在 `windows: ["main"]` で `"main"` ウィンドウにだけ `core` / `opener` / `fs` / `store` の権限を与えている。新規ウィンドウが同じプラグインを呼ぶには、そのウィンドウラベルもこの allowlist に含める必要がある。Tauri v2 はラベルのグロブ (`workspace-*`) をサポートする。

## Goals / Non-Goals

**Goals:**

- 1 プロセスで複数ウィンドウを同時起動でき、それぞれが独立したワークスペース・タスクキャッシュ・状態変化検知スナップショットを持つ
- `File > New Window` (`Cmd+Shift+N`) メニュー経由で新しいウィンドウを開ける
- `File > New Window` で開いたウィンドウは常に「ワークスペース未選択」状態 (WelcomePage) で起動し、ユーザーは「ディレクトリピッカー」または「履歴からの選択」のいずれかで明示的にワークスペースを決める
- macOS の Dock リオープン (全ウィンドウクローズ状態で Dock アイコンクリック) で履歴自動復元付きの新規ウィンドウが生成され、起動時と同じ「最後に開いていたワークスペースに戻る」体験になる
- ウィンドウラベル (`main` / `workspace-*`) はバックエンド実装詳細であり、ユーザーから観測できる差異は「作成経路 (起動 / Reopen / New Window) によって自動復元するかしないか」のみ
- WelcomePage の Recent Workspaces 一覧は実在ディレクトリのみを表示する (履歴データはバックエンドに保持されるが UI には出さない)
- 既存の単一ウィンドウユースケースの挙動・パフォーマンス・テストカバレッジは劣化させない (起動時の自動復元、`Cmd+,` Settings、Board の DnD などはそのまま)
- マルチウィンドウ環境下で `Cmd+,` Settings イベントが押下したウィンドウのみに到達する
- ウィンドウクローズ時に当該ウィンドウ用の AppState エントリを GC してメモリリークを防ぐ
- 既存の `AppState` 単体テストカバレッジを新しいウィンドウラベルキー方式に追従させる

**Non-Goals:**

- ウィンドウ間でのドラッグ&ドロップによるタスク移動
- ウィンドウ間でのワークスペース横断検索・タグフィルタの共有
- 既存ウィンドウのワークスペースを別のウィンドウへコピー / 同期する機能
- 履歴データの編集 (削除、お気に入り、ピン留め) — 今回は読み取りと既存の自動更新のみ
- 履歴に残る無効パスのバックエンド側での自動クリーンアップ (UI 側でフィルタするだけ、永続データは保持)
- ウィンドウ位置・サイズの個別永続化 (全ウィンドウ同一の `inner_size(1280, 800)` で起動)
- Windows / Linux 環境の Dock 相当 (タスクバーアイコン) クリックでのウィンドウ復帰挙動 (今回は macOS の `RunEvent::Reopen` のみ対応)
- Welcome 画面の Recent Workspaces からのコンテキストメニュー (右クリックでエクスプローラで開く等) — 今回は単純クリックのみ
- マルチウィンドウ起動時の Linux / Windows での見た目調整 (macOS のトラフィックライト位置調整は引き継ぐが、他 OS は既存実装のまま)
- Tauri の `Manager::singleton_window` のような自前ウィンドウシングルトンガード機構 (今回ユーザーが何枚でも開けてよい)
- WelcomePage 上での `Cmd+,` (Settings) 対応 — 現状の Cork で `BoardPage` のみが `menu:open-settings` を listen している pre-existing 状態を踏襲。マルチウィンドウで新規ウィンドウが welcome 状態にいる間 `Cmd+,` は無反応になるが、ワークスペースが選ばれるまで Settings 自体に意味がないため許容。専用 issue で別途対応
- Recent Workspaces クリックと `set_workspace_directory` 実行の間にディレクトリが削除される TOCTOU の防御 (`set_workspace_directory` の冒頭での `is_dir()` チェック導入) — 別 PR で対応。クリック時点のフィルタ結果と実態がほぼ一致する前提を許容

## Decisions

### 1. AppState のスコープ単位を「ウィンドウラベル」キーのマップにする

**選択肢:**

| 案                                                              | 判断                                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ウィンドウラベルキーの HashMap (採用)**                    | コマンドが `tauri::WebviewWindow` を受け取れば `window.label()` で自然にキーが取れる。Tauri の DI とラベルが既に持つ一意性を活用でき、フロントエンドは何も追加で送らなくてよい                |
| B. ウィンドウ ID (`WindowEvent` から得る) で連番採番            | 不要に複雑化する。ラベルは既に文字列で一意であり、ライフサイクル・イベントもラベル基準で発火する                                                                                              |
| C. ワークスペースパスをキーにして「同じパスのウィンドウは共有」 | ユーザーが意図的に同じワークスペースを 2 枚開いたとき、片方の楽観的更新がもう一方に副作用を与えるのを避けたい。`last_reported` の per-window 履歴管理が壊れる                                 |
| D. ウィンドウごとに完全に独立した `AppState` インスタンス       | Tauri の `app.manage()` は 1 型に対し 1 インスタンスしか管理できない。ウィンドウ作成のたびに `manage` するのは不可能で、ラッパー型を入れたとしてもキー検索のオーバーヘッドは A 案と同じになる |

**採用理由:**

ウィンドウラベルは Tauri v2 で `WebviewWindow::label()` が常に返す `&str` で、コマンド呼び出しのたびに呼び出し元ウィンドウから機械的に取り出せる。`#[tauri::command]` のシグネチャに `window: tauri::WebviewWindow` を追加するだけで、フロントエンドの `invoke()` 呼び出しは変更不要。これは「ウィンドウ context は呼び出し境界で自動注入される」という Tauri の設計と整合する。

### 2. 全コマンドが `tauri::WebviewWindow` 引数を取る形へ統一する

**選択肢:**

| 案                                                                                        | 判断                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. コマンド本体に `window: WebviewWindow` を直接渡す (採用)**                           | Tauri v2 の DI で対応。シグネチャに 1 引数増えるだけ、呼び出し側変更不要、テスト不可能なのは元から同じ (`#[tauri::command]` 本体は元々 `cargo test` 対象外) |
| B. グローバル `AppState` 経由で「最後にアクティブだったウィンドウのラベル」を読む         | 競合する。複数ウィンドウが同時にコマンドを発火したときに正しく対応付かない                                                                                  |
| C. フロントエンドから `window.label()` を JS で取得し、毎回コマンド引数として明示的に渡す | 重複・冗長。フロントエンドの全 API ラッパーに引数追加が必要で、忘れたら無音でグローバル状態が壊れる                                                         |

**採用理由:**

A 案は Tauri ランタイムの保証に乗れるため、フロントエンドのコードを 1 行も変えずにすべてのコマンドが「自ウィンドウのスコープでだけ動く」性質を獲得する。漏れがあればコンパイルエラーになる (state API がラベル必須になるため) ので、機械的に検出できる。

### 3. メインウィンドウのワークスペース自動復元は `lib.rs::setup()` で実施

**選択肢:**

| 案                                                                                                                                 | 判断                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. `setup()` で履歴の先頭から `is_dir()` を通る最初のパスを `"main"` キーで AppState にシード (採用)**                           | ライフサイクルが明確: 「main の初期セット」と「以降の per-window セット」が分離される。フロントエンドの `getWorkspaceDirectory()` は AppState を読むだけのシンプルなコマンドになる |
| B. 既存の `get_workspace_directory` のフォールバックロジックを残し、新規ウィンドウだけ別の `get_workspace_directory_strict` を使う | コマンドが 2 種類になり、フロントエンドが「自分は新規か」を判断して呼び分ける必要が生じる。境界が漏れる                                                                            |
| C. 「すべてのウィンドウは初期 `None`」とし、メインウィンドウもユーザーが明示的に履歴から復元する                                   | 既存ユーザー体験のリグレッション。アプリ起動して即ボードを見せるのが現状の挙動                                                                                                     |

**採用理由:**

A 案で、ロジックを `setup()` に上げると、各コマンドは「state にあるかどうか」を単純に反映するだけになり、責務が分離される。`fs_scope().allow_directory()` のシード呼び出しも同じ場所でできる。

### 4. ウィンドウクローズ時に AppState エントリを掃除する

`Builder::on_window_event` で `WindowEvent::Destroyed` を購読し、`state.remove_window(window.label())` を呼ぶ。`Destroyed` を選ぶ理由は `CloseRequested` が `prevent_close()` でキャンセル可能なため (今は使っていないが将来「閉じる前に保存していい?」確認を入れたとき、確認をキャンセルされた直後に state を消すとボードが壊れる)。`Destroyed` はウィンドウが本当に消えた後にだけ来る。

### 5. ウィンドウラベル採番は `AtomicU64` カウンターで `workspace-<n>`

**選択肢:**

| 案                                                         | 判断                                                                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. AppState 内の `AtomicU64` を `fetch_add` (採用)**     | 単純で衝突しない。プロセスのライフタイムだけ単調増加すれば十分。ウィンドウを閉じても番号は再利用しない (再利用すると capability マッチが壊れる懸念が残る)       |
| B. UUID 文字列                                             | 過剰。capability ファイルでワイルドカードマッチさせるためにラベルプレフィックスを統一する必要がある以上、人間可読な連番のほうが運用上わかりやすい               |
| C. 高分解能タイムスタンプ                                  | `std::time::SystemTime` のずれや同タイミング呼び出しで重複する可能性                                                                                            |
| D. 初期にメインウィンドウのラベルも `workspace-0` に揃える | 既存テスト、capability、設定の `windows: ["main"]` を破壊的に書き換える必要がある。`"main"` は固有 / 最初のウィンドウだけ別扱いにするほうがコード変更量が少ない |

**採用理由:**

A 案で `workspace-1`, `workspace-2`, ... と採番する。capability ファイル側は `["main", "workspace-*"]` でカバーする。`AtomicU64` は AppState に持つので、テストや並行アクセスでも安全。

### 6. メニューイベントの emit 範囲を「フォーカス中のウィンドウのみ」に絞る

現状 `app.emit("menu:open-settings", ())` でアプリ全体にブロードキャストしているが、複数ウィンドウだと全ウィンドウの Settings が一斉に開いてしまう。`app.get_focused_window()` を取り、その `WebviewWindow::emit()` で送る。フォーカス取得に失敗 (ナビゲーション直後など) しても、Settings は致命的な機能ではないので無視。`new_window` は当然グローバル動作 (どこにフォーカスがあっても新ウィンドウ生成は妥当)。

### 7. 履歴の存在確認はバックエンド (`list_workspace_history`) で実施

フロントエンドからは `@tauri-apps/plugin-fs` 経由で `lstat` などを叩けば確認はできるが、`workspace_history` の永続データを扱う層 (Rust 側) で一元的に行うほうが整合性が高い。`workspace.rs` には既に `parse_workspace_history()` ヘルパーがあり、`get_workspace_directory` も同じ生存確認を行っている。これと完全に同じ `PathBuf::from(s).is_dir()` フィルタを再利用する。`list_workspace_history` はフィルタ後の文字列配列を返すだけのシンプルなコマンドにする。

**永続データは変更しない**: 無効パスを発見しても `settings.json` の `workspace_history` キーから消さない。これは現行 `get_workspace_directory` の方針と同じ (「起動時の `is_dir()` チェックは履歴を変更しない — 起動は新規 open イベントではなく単なる読み戻し」) を踏襲する。一時的にドライブが外れているケースなどで、復帰後に履歴が消えていると困るため。

### 8. WelcomePage UI: ヒーローを上、Recent Workspaces を下のシンプル縦並び

**選択肢:**

| 案                                                                                            | 判断                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ヒーロー (ロゴ + CTA) を上、`Recent Workspaces` ラベル + 縦スクロールリストを下 (採用)** | 既存のヒーロー中心レイアウトを温存しつつ拡張できる。履歴 0 件 (初回ユーザー) なら既存のヒーローのみ表示で違和感なし。ヒーローと履歴のヒエラルキーが視覚的に明確 |
| B. 左にヒーロー、右に履歴リストの 2 カラム                                                    | ウィンドウサイズ (1280x800) には収まるが、履歴 0 件のときの空白感と、`Cmd+Shift+N` で開いた瞬間 (履歴アリ前提) のレイアウト切替で違和感が出る                   |
| C. 履歴アリのときはヒーローを縮小して履歴を主役にする                                         | 既存 UX に対する変更が大きく、デザインスコープが膨らむ。「Open recent or pick a new directory」の二者択一は同等の選択肢で扱うほうが自然                         |

**採用理由:**

- 履歴 0 件 → 既存と同じ「ロゴ + CTA だけ」の見た目に自動的に戻る (空リストなら描画しない)。
- 履歴アリ → CTA の下に `Recent Workspaces` セクション。視線移動は「タイトル → CTA → 履歴」の自然な縦進行。
- リストは最大高さを設けてオーバーフローはスクロール (最大 50 件まで履歴があり得るため必須)。
- リスト 1 行は既存の `PathDisplay` の clickable バリエーション (`onClick` ありの分岐) を再利用。これにより `BoardPage`/`SettingsDialog` で使われている既存スタイルと一貫した見た目になる。

### 9. WelcomePage に `data-tauri-drag-region="deep"` を追加する

macOS のタイトルバーオーバーレイ (`TitleBarStyle::Overlay`) 構成で、Welcome 画面はドラッグ可能領域を全く持たない (現在も同様の隠れバグ)。新規ウィンドウは `File > New Window` から開いた直後に Welcome 状態になるため、この状態でウィンドウ移動できないのは UX として致命的。`WelcomeLayout` のルート要素に `data-tauri-drag-region="deep"` を付与する。既存の CSS で `button` / `input` / `a` / `select` / `textarea` は `app-region: no-drag` になるので、CTA や履歴アイテムは正しく click 可能。

### 10. `RecentWorkspacesList` は molecule に置く

| 案                     | 判断                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. molecule (採用)** | 状態を持たず、props (`paths: string[]`, `onSelect: (path) => void`) だけで動く。ラベルテキスト + スクロール可能リスト + 再利用 `PathDisplay`          |
| B. organism            | 自前の `useEffect` + API 呼び出しなど自己完結性を持たせる選択肢もあるが、organisms ルール上 `@/api` 直接禁止。pages がフェッチして渡す流儀と整合      |
| C. page 直書き         | リスト 1 個のための単発レンダリングなので不要にも見えるが、`RecentWorkspaceItem` 行スタイル + ラベル + 空状態の組合せは独立部品として切り出す価値あり |

WelcomePage がマウント時に `listWorkspaceHistory()` をフェッチして `RecentWorkspacesList` に渡す。リスト自体はステートレス。

### 11. Recent Workspaces クリック時のフロー

```
ユーザークリック
  ↓
setWorkspaceDirectory(path)       (backend: AppState[this window] = path, fs_scope allow, 履歴更新)
  ↓
onDirectorySelected(path)         (frontend: App.tsx の dir state を更新)
  ↓
App.tsx が pageKey="board" に切替
  ↓
BoardPage が dir をキーに remount → useWorkspace が起動
```

ディレクトリピッカー経由と完全に同じフロー。違いは「pickDirectory() を経由しない」点だけ。Rust 側の `set_workspace_directory` は同じ実装で済む (履歴更新ロジックは再選択するたびに先頭に並び替えてくれる)。

### 12. capability ファイルのワイルドカード

`capabilities/default.json` の `windows` フィールドを `["main", "workspace-*"]` に変更する。Tauri v2 はラベルのグロブマッチを正式サポートする。これにより、新ウィンドウラベルは必ず `workspace-` プレフィックスを持つ規約と一致する。万が一プレフィックスを破壊的に変更したくなったら、capability も同時に変える必要がある (テスト工程で検出可能)。

### 13. Dock リオープン (`RunEvent::Reopen`) は履歴自動復元付きで新規ウィンドウを開く

macOS では、すべてのウィンドウを閉じたあともアプリプロセスは生存し続ける (`Window > Close Window` は Tauri 標準の `close_window()` ハンドラで、最後の 1 枚を閉じてもアプリ終了はしない)。ユーザーが Dock の Cork アイコンをクリックすると Tauri は `RunEvent::Reopen { has_visible_windows: false, .. }` を発火する。これに何も応答しないと、Cork は生きているのに何も画面に出ない状態が続いてしまう (macOS 規約違反)。

**選択肢:**

| 案                                                   | 判断                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 履歴自動復元付きの新規ウィンドウを開く (採用)** | 起動と Reopen を「同じ意味」(= ユーザーがアプリを使い始める瞬間) として一貫させる。ユーザーは「Cork を開いたら直前の続きから」というメンタルモデルで両者を区別しなくてよい |
| B. WelcomePage 状態の新規ウィンドウを開く            | `File > New Window` と同じ挙動になり、Reopen は「明示的な新ウィンドウ操作」と同義化する。起動と Reopen で挙動が乖離するため、ユーザーが意図せず履歴を失った気持ちになる    |
| C. 何もしない (現状維持)                             | macOS 規約に反する。Dock からアプリを呼び戻せない問題が残る                                                                                                                |

**採用理由:** ユーザーが「アプリを開く」という単一の行為に対して、起動経路 (cold start / Dock 復活) によって挙動が違うのは混乱を招く。両者とも履歴復元を行うことで「最後に見ていたものに戻る」というメンタルモデルが成立する。

**ラベル戦略:** Reopen で生成されるウィンドウは `state.next_window_label()` で `workspace-<n>` を採番する。**起動時の最初のウィンドウだけは固定ラベル `main` を使う**が、それ以降 (Reopen / `New Window` メニュー) のウィンドウ生成では `main` を再利用しない。理由は (a) `main` ラベルは「プロセス起動時の最初の 1 枚」という歴史的固定値であって「自動復元するウィンドウ」を意味する論理ラベルではないこと、(b) `AtomicU64` 採番との単調性を維持したい (再利用は将来の競合バグ温床)、(c) capability のワイルドカード `workspace-*` が既に新規ウィンドウをカバーするので機能差は出ないこと。「自動復元するかしないか」はラベル文字列ではなく**ウィンドウ作成経路の責務**にする (起動経路と Reopen 経路は復元する、`New Window` 経路は復元しない)。

**`has_visible_windows: false` の細分化 (重要):**

`RunEvent::Reopen` は Tauri ソース (`crates/tauri/src/app.rs:275`) で `NSApplicationDelegate::applicationShouldHandleReopen:hasVisibleWindows:` に対応すると明記されている。この Apple API のセマンティクスは「画面に見えているウィンドウがあるか」であり、**以下のすべてのケースで `has_visible_windows: false`** で発火する:

1. ユーザーが `Cmd+W` を繰り返してすべてのウィンドウを閉じた状態
2. ユーザーが `Cmd+H` でアプリを完全に隠した状態 (ウィンドウは生きているが非表示)
3. ユーザーがすべてのウィンドウを `Cmd+M` で最小化した状態 (ウィンドウは生きているが Dock にしまわれている)

「2」「3」のケースで「履歴自動復元の新ウィンドウを生成する」と、隠したウィンドウはそのまま残ったまま新規が増えるという、macOS 規約に反する挙動になる。正しい応答は **既存ウィンドウが残っているなら全部 `show()` + `unminimize()` + `set_focus()` で表に出す、本当に 0 枚なら新規生成** という分岐。

**実装:**

```rust
tauri::Builder::default()
    .setup(|app| { /* main window 起動シードはここで */ })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
        if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = event {
            let windows = app_handle.webview_windows();
            if windows.is_empty() {
                // 本当に 0 枚 → 履歴自動復元付きで新ウィンドウ
                let _ = reopen_with_history_restore(app_handle);
            } else {
                // Cmd+H や Cmd+M で見えなくなっているだけ → 既存ウィンドウを表に出す
                for (_, w) in windows {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
    });
```

`reopen_with_history_restore` の手順 (順序が重要 — 後述のレース回避のため):

1. `state.next_window_label()` で `workspace-<n>` を採番
2. `seed_window_from_history(app, &label)` で **AppState への workspace セット + `fs_scope` 登録を先に済ませる**
3. `build_workspace_window(app, &label)` でウィンドウを生成

`build()` は同期で webview を生成して即時 return するが、その後の JS ロード (`useCurrentDir` の `getWorkspaceDirectory()` 呼び出しを含む) は非同期で別スレッドで走る (`crates/tauri/src/webview/webview_window.rs:438` の `build` は `with_webview` を同期呼び出し、JS のロード完了通知は別途 `on_page_load` イベントで来る)。**先に build してから seed すると、JS が `getWorkspaceDirectory()` を呼んで `None` を受け取った直後に seed が走るレースが発生し得る**。 build より前に seed を済ませることでこのレースを構造的に消す。

履歴復元先がなければ seed は no-op となり、build した新ウィンドウは welcome 状態で表示される (これは起動時の「履歴空 → main が WelcomePage」と整合する)。

`has_visible_windows: true` の場合 (ウィンドウがすでに表示中で他アプリにフォーカスがあるだけ) は何もしない — macOS が標準でフォアグラウンド復帰させる。

### 14. クロスウィンドウ整合性: 「内部書き込みは status と order を必ず同時に書く」invariant

複数ウィンドウが同じワークスペースを開いたとき、ウィンドウ A のタスク移動がウィンドウ B 側で誤って「外部編集として検知」されて先頭移動が発火する懸念が想定される。実コード (`src-tauri/src/task.rs` の `compute_reconciled_orders`) を検証した結果、**現状のロジックではこの誤発火は起きない** ことを確認した。理由は reconcile が次の条件を厳格に AND で要求するため:

```rust
if prev_status != &task.status && order_unchanged {
    // ← 「ステータス先頭に移動」発火
}
```

Cork の内部書き込みコマンドはすべて status と order の両方を frontmatter に書き込む契約になっており (`move_task` は引数として `status, order` を受け取って両方更新、`useWorkspaceTasks.updateTask` も status 変更時に `Math.min(...) - 1` で新 order を必ず付与)、ウィンドウ B 側のスナップショットと比較すると order も同時に diff になるため `order_unchanged = false` で reconcile はスキップする。

この invariant は **多窓体験の正しさをまるごと支える前提**になっている。将来、内部書き込みコマンドを追加 / 変更するときに「status だけ書いて order は触らない」実装を入れると、多窓で同期されたすべての他ウィンドウが当該タスクを「先頭移動」と誤判定して書き戻すバグが入る。これは Rust 側の単体テストでは検知しづらいクラスのバグなので、spec の Requirement として明文化する (`specs/multi-window/spec.md` に「内部書き込みは status と order を必ず同時に書く」要件)。

**選択肢の検討:**

| 案                                                                                                           | 判断                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. invariant として spec に明記 (採用)**                                                                   | 既存の reconcile 設計が正しく、内部書き込みの呼び出し規約も既に整っている。明示化することで「将来この invariant が崩れたら多窓が壊れる」という非自明な依存関係をドキュメント化できる |
| B. reconcile 側で「内部書き込み判定」を追加して防御的にする (例: 内部書き込み直後の watcher 発火を suppress) | 複雑度が増す。タイミングに依存する suppress は debounce 設計と相性が悪い。invariant 自体はシンプル — 守ればいい                                                                      |
| C. クロスウィンドウ書き込みを SerDe 等で識別して reconcile から除外                                          | 識別チャネルの追加が必要 (ファイル frontmatter に「書き込み元」を埋めるか、別の sidecar が要る)。invariant よりはるかにコストが高い                                                  |

## Risks / Trade-offs

| Risk                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppState` API のシグネチャ変更によりすべての `#[tauri::command]` の本体が変わる (一括書き換え)                               | コンパイラが救済してくれる: 1 引数追加し忘れたコマンドは型エラーになるため、手動レビューより検出が確実。テストでカバーされているヘルパー (`parse_workspace_history`, `update_workspaces_map`, `sanitize_title` ...) のテストは引数変更を伴わない (純関数のため)、影響を受けるのは `AppState` のテストだけ               |
| 既存ユーザー: 既存のグローバル状態のクセ (settings.json → `workspace_history`) との互換性                                     | 永続データ (`settings.json`) のスキーマは無変更。`workspace_history` の読み書き経路は既存と同じヘルパー (`parse_workspace_history` / `prepend_unique_capped` / `history_to_json`) をそのまま使う                                                                                                                        |
| 2 つのウィンドウが同じワークスペースを開いた場合、両方が同じ `.md` ファイルを編集して競合する                                 | 既に「Cork 外のエディタが編集しても外部編集として検出する」フレームワーク (`reconcile_external_status_changes` + `useWorkspaceWatcher`) が存在する。`last_reported` を per-window で持つ設計のため、ウィンドウ B の書き込みはウィンドウ A から見て「外部編集」として正しく検出される                                    |
| 同一ワークスペース 2 窓状態でドラッグ移動が他方の reconcile によって「ステータス先頭に強制移動」される                        | Decision 14 で詳述。Cork 内部書き込みは status と order を必ず同時に書き込み、reconcile は (status diff AND order_unchanged) の AND 条件のみで反応するため、現コードでは誤発火しない。invariant を spec の Requirement として明文化、将来のコマンド追加でこの規約が破られないよう gate する                             |
| ウィンドウクロスでのキャッシュ整合性 (ウィンドウ A の書き込みがウィンドウ B のキャッシュに反映されない懸念)                   | `useWorkspaceWatcher` (フロントエンド) が watcher 経由で `reconcile_external_status_changes` を必ず呼び、reconcile 内部で自ウィンドウの `tasks_cache` を `invalidate_cache()` してディスクから fresh 再読込する設計 (`reconcile_external_status_changes` 内部)。per-window cache のままで cross-window 整合性は保たれる |
| Reopen ハンドラ内の build → seed 順序ミスでフロントエンドが None を読むレース                                                 | Decision 13 で seed → build の順を実装上強制。`state.next_window_label()` はラベル文字列をプロセス内で確定できるため、build に先立つ AppState 初期化が可能                                                                                                                                                              |
| Dock リオープン時に `Cmd+H` 隠し状態や `Cmd+M` 最小化状態でも新ウィンドウが生成される誤動作                                   | Decision 13 で `app.webview_windows().is_empty()` 分岐により、隠れているだけのウィンドウは新規生成せず `show()` + `unminimize()` + `set_focus()` で復帰。`applicationShouldHandleReopen:hasVisibleWindows:` の Apple API セマンティクスに準拠                                                                           |
| `app.get_focused_window()` がイベント発火時に意図したウィンドウを指さない競合                                                 | 実害は限定的: メニュー経由の `Cmd+,` は (ショートカット入力時 → メニューイベント発火) 間の遅延が極小で、その間にフォーカスを失うシナリオは稀。万が一外したら何も起きない (Settings が開かないだけ、データ破壊はない)                                                                                                    |
| `WelcomeLayout` に `data-tauri-drag-region="deep"` を入れることで、Welcome 内のボタンや履歴行のドラッグ判定がおかしくなる懸念 | 既存の `style.css` で `[data-tauri-drag-region] button` などには `app-region: no-drag` が当たっている。`PathDisplay` のクリック可能バリエーションは `<button>` なのでこのルールに乗る。組み込み済みの一般ルールを再利用するだけ                                                                                         |
| `list_workspace_history` の `is_dir()` 呼び出しが多数の SMB / ネットワークマウントパスを含む履歴で遅くなる                    | 最大 50 件 + 平均的にはローカル FS の単純な stat 呼び出し。Welcome 表示時に 1 回だけ呼ばれる (リアルタイム更新は不要)。実測で問題が出たら `tokio::task::spawn_blocking` 化 or 履歴の永続的なクリーンアップを別 PR で導入する。今回は同期呼び出しで十分                                                                  |
| `WindowEvent::Destroyed` 時の state 掃除が漏れて、長期セッションで `HashMap` が肥大化する                                     | テストとレビューで担保。`AppState::remove_window` を呼ぶ単一経路を `lib.rs::on_window_event` に集約し、コメントで「window のライフタイムと結びついた唯一の cleanup 点」と明示する                                                                                                                                       |
| 既存 `AppState` の単体テストが大幅に書き換わる                                                                                | テストは既に「workspace 単体機能」を網羅していて、これを「特定ウィンドウラベルに対しての挙動」に書き換えるだけ。新規ケース (`remove_window`, 複数ウィンドウの独立性) を追加するため net でカバレッジは向上する                                                                                                          |
| 最後の 1 枚を閉じた後にユーザーが Dock アイコンを押してもアプリが復帰しない macOS 規約違反                                    | Decision 13 で `RunEvent::Reopen { has_visible_windows: false }` をハンドルし、履歴自動復元付きの新規ウィンドウを開く。`Cmd+W` 自体は Tauri 標準の `close_window()` を維持し、最後の 1 枚を閉じてもアプリは終了させない (macOS 規約準拠)。今回スコープ内                                                                |
| Tauri v2 の capability ワイルドカード `workspace-*` が将来のバージョンで動かなくなる                                          | Tauri v2 ドキュメントで `windows` フィールドのワイルドカードは安定サポート。仮に変わったら capability ファイル側を書き換えるだけで対応可能                                                                                                                                                                              |

## Migration Plan

「破壊的だが、ユーザー側の永続データには触れない」ため、特別なマイグレーションは不要:

1. `state.rs` を書き換え、AppState の新 API に揃える (テストも同時に書き換え)。
2. 全コマンドのシグネチャに `WebviewWindow` を足し、`require_workspace(window.label())` に切り替える。
3. `lib.rs::setup()` の中で「main ウィンドウのワークスペース自動シード」と「`on_window_event` での cleanup」を追加。`.run(generate_context!())` を `.build(...).run(|app, event| ...)` 形式に切り替え、`RunEvent::Reopen` ハンドラを実装。
4. `menu.rs` に `File > New Window` を足す & `on_menu_event` の Settings ハンドラをフォーカスウィンドウへの emit に変更。
5. `workspace.rs` に `open_new_window` と `list_workspace_history` を追加。
6. `capabilities/default.json` の `windows` を更新。
7. フロントエンド: `src/api/window.ts` 新規追加、`src/api/workspace.ts` 拡張、`WelcomePage` リファクタリング、`RecentWorkspacesList` 追加、`WelcomeLayout` の drag region。
8. AGENTS.md (`src-tauri/AGENTS.md` + `src/components/pages/AGENTS.md` + `src/components/molecules/AGENTS.md`) を更新。

ロールバック: いずれも単一ブランチ内で完結する変更なので、PR を revert すれば旧挙動に戻る。`settings.json` の `workspace_history` キー (永続データ) には触らないので、ユーザー側に残るゴミは発生しない。
