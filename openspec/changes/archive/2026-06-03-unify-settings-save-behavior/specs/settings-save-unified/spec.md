## ADDED Requirements

### Requirement: 設定パネル内の変更は Save 押下時にのみ確定する

設定パネル内で編集される全項目（Workspace Directory および Statuses）は、Save ボタンが押されるまでバックエンドの永続化対象に反映されてはならない。ピッカーで選んだ workspace directory も、`useStatusEdit` のローカル編集と同じく未確定 pending 状態として保持される SHALL。

#### Scenario: Directory を選び直しただけでは永続化されない

- **WHEN** ユーザーが設定パネルで "Change Directory" を押してディレクトリピッカーから新しいフォルダを選ぶ
- **THEN** Rust 側の `state.workspace_dir` および `settings.json` の `workspace_dir` キーはまだ変更されていない
- **AND** 設定パネルは閉じない
- **AND** Workspace Directory 表示は新しいパスに更新されている

#### Scenario: Statuses 編集だけでは永続化されない

- **WHEN** ユーザーがステータス行のラベルを編集し、追加または削除する
- **THEN** `save_statuses` Tauri コマンドはまだ呼ばれていない

### Requirement: Save ボタン押下で全 pending 変更を順に確定する

Save ボタンが押されたとき、設定パネルは次の順で処理を行う SHALL: (1) Statuses の保存、(2) Workspace Directory の確定。Statuses 保存が失敗した場合、Workspace Directory の確定は実行されず、パネルも閉じない MUST。

#### Scenario: Statuses だけ変更して Save

- **WHEN** ユーザーが Statuses のみ編集し Save を押す
- **THEN** `save_statuses` が現在の workspace に対して呼ばれる
- **AND** Workspace Directory 関連の Tauri コマンドは呼ばれない
- **AND** 設定パネルが閉じる

#### Scenario: Workspace Directory だけ変更して Save

- **WHEN** ユーザーが新しいディレクトリを選んだ後で Save を押す
- **THEN** Statuses 保存は実行されるが内容は不変
- **AND** その後 `set_workspace_directory(pendingPath)` が呼ばれる
- **AND** 親コンポーネントの workspace dir state が新しいパスに更新される
- **AND** 設定パネルが閉じる

#### Scenario: 両方変更して Save

- **WHEN** ユーザーが Statuses と Workspace Directory の両方を変更し Save を押す
- **THEN** まず `save_statuses` が**現在の（旧）workspace** に対して呼ばれる
- **AND** その後 `set_workspace_directory(pendingPath)` が呼ばれて新しい workspace に切り替わる
- **AND** 設定パネルが閉じる

#### Scenario: Statuses バリデーション失敗時は Directory 確定もスキップ

- **WHEN** Statuses に重複ラベルがある状態で、Workspace Directory も pending にして Save を押す
- **THEN** `save_statuses` は呼ばれない
- **AND** `set_workspace_directory` も呼ばれない
- **AND** エラーメッセージが表示される
- **AND** 設定パネルは閉じない
- **AND** Workspace Directory の pending 状態は保持される

### Requirement: Cancel / Esc / 背景クリック / X ボタンは全 pending 変更を破棄する

設定パネルの閉じる経路（Cancel ボタン、Esc キー、背景クリック、X ボタン）はすべて同一の破棄ロジックを実行し、Workspace Directory の pending パスと Statuses の編集中ローカル state を破棄してパネルを閉じる SHALL。

#### Scenario: Cancel で破棄

- **WHEN** ユーザーが新しいディレクトリを pending にした後 Cancel を押す
- **THEN** Workspace Directory は変更前のままで、Rust 側 state も変わらない
- **AND** 再度設定パネルを開くと現在の（変更前の）パスが表示される

#### Scenario: Esc で破棄

- **WHEN** ユーザーが pending 状態のまま Esc キーを押す
- **THEN** Workspace Directory は変更前のままで、Rust 側 state も変わらない

#### Scenario: 背景クリックで破棄

- **WHEN** ユーザーが pending 状態のままモーダル背景をクリックする
- **THEN** Workspace Directory は変更前のままで、Rust 側 state も変わらない

#### Scenario: X ボタンで破棄

- **WHEN** ユーザーが pending 状態のまま右上の X ボタンを押す
- **THEN** Workspace Directory は変更前のままで、Rust 側 state も変わらない

### Requirement: 未保存変更はパネルヘッダーで一元的に提示される

設定パネルは「未保存の変更があるか」を 1 つの真実として扱い、パネルヘッダー（"Settings" タイトル横）にインジケータを表示する SHALL。インジケータの可視条件は「workspace directory が pending」または「statuses が初期状態から変化している」のいずれかが真であること MUST。

#### Scenario: workspace directory のみ pending

- **WHEN** ユーザーがディレクトリピッカーで新しいパスを選び、まだ Save を押していない
- **THEN** "Settings" タイトル横に "• Unsaved changes" 相当のインジケータが表示される

#### Scenario: statuses のみ編集

- **WHEN** ユーザーがステータスラベルを編集、追加、削除、または並び替えする
- **THEN** "Settings" タイトル横に "• Unsaved changes" 相当のインジケータが表示される

#### Scenario: 何も変更していない

- **WHEN** 設定パネルを開いた直後、ユーザーが何も操作していない
- **THEN** "• Unsaved changes" インジケータは表示されない

#### Scenario: ピッカーで現在の workspace と同じパスを選び直したとき

- **WHEN** pending 状態のユーザーが、再度ピッカーを開いて現在の workspace と同じパスを選択する
- **THEN** workspace directory の pending 状態は解除され、"• Unsaved changes" インジケータも消える（statuses が dirty の場合はインジケータは出続ける）

#### Scenario: セクションごとの個別インジケータは持たない

- **WHEN** workspace directory または statuses が個別に dirty な状態
- **THEN** "Workspace Directory" / "Statuses" のセクションラベル横には個別の Unsaved 表示は出さない

### Requirement: Save ボタンは未保存変更がある時のみ押下できる

Save ボタンは「未保存変更がある」かつ「Save 処理中ではない」ときにのみ enabled となる SHALL。何も変更していない状態では disabled として表示し、押下しても何も起きない MUST。

#### Scenario: 何も変更していないとき

- **WHEN** 設定パネルを開いて何も操作していない
- **THEN** Save ボタンは disabled 状態で表示される

#### Scenario: workspace directory を pending にしたとき

- **WHEN** ユーザーがディレクトリピッカーで新しいパスを選ぶ
- **THEN** Save ボタンが enabled に変わる

#### Scenario: statuses を編集したとき

- **WHEN** ユーザーがステータスラベルを編集、追加、削除、または並び替えする
- **THEN** Save ボタンが enabled に変わる

#### Scenario: 保存処理中

- **WHEN** Save 処理が進行中
- **THEN** Save ボタンは disabled 状態となり、二重押下できない

### Requirement: Workspace Directory の編集導線はパス表示カード自体に統合する

「Workspace Directory」の編集動作は、現在パスを表示するカード自体をクリック可能にすることで提供される SHALL。設定パネル下部のフォームアクション行（Cancel / Save）には、項目固有のアクションボタンを置かない MUST。

#### Scenario: パス表示カードのクリックでピッカーが開く

- **WHEN** ユーザーが Workspace Directory のパス表示カードをクリックする
- **THEN** `pick_directory` が呼ばれてネイティブダイアログが開く

#### Scenario: hover/cursor で interactive であることが分かる

- **WHEN** パス表示カードにポインタが乗る
- **THEN** カーソルが pointer に変わる
- **AND** 背景・ボーダーに hover state の視覚変化が起きる

#### Scenario: フォルダアイコンによる affordance

- **WHEN** Workspace Directory セクションが表示されている
- **THEN** パス表示カード内にフォルダを表すアイコンが含まれており、クリック可能であることが視覚的に示唆される

#### Scenario: Save 中はカード操作が無効化される

- **WHEN** Save 処理の最中にパス表示カードをクリックしようとする
- **THEN** カードは disabled 状態となり、`pick_directory` は呼ばれない

#### Scenario: 下部アクション行は Cancel / Save のみ

- **WHEN** 設定パネルを表示している
- **THEN** 下部のボタン行は Cancel と Save のみで構成され、"Change Directory" などの項目固有ボタンは存在しない

### Requirement: Tauri コマンドは「ピッカーを開く」と「workspace を確定する」を分離する

Rust 側は次の 2 コマンドを提供する SHALL:

- `pick_directory`: ネイティブダイアログを開いて選択されたパスを返す。state 更新・store 永続化・fs scope 許可などの副作用を持たない MUST
- `set_workspace_directory(path: String)`: 指定パスを `state.workspace_dir` に格納し、`settings.json` ストアに永続化し、fs scope に許可する

旧 `select_directory` コマンドは削除される MUST。

#### Scenario: pick_directory はキャンセル時に None を返す

- **WHEN** ユーザーがディレクトリピッカーで Cancel を選ぶ
- **THEN** `pick_directory` は `None` を返す
- **AND** Rust 側 state と store には変更が加わらない

#### Scenario: pick_directory は選択時にパスを返すのみ

- **WHEN** ユーザーがディレクトリピッカーでフォルダを選ぶ
- **THEN** `pick_directory` は選択されたパス文字列を返す
- **AND** `state.workspace_dir` は変更されない
- **AND** `settings.json` の `workspace_dir` キーは変更されない

#### Scenario: set_workspace_directory が state と store と fs scope を更新する

- **WHEN** `set_workspace_directory("/path/to/dir")` が呼ばれる
- **THEN** `state.workspace_dir` が `"/path/to/dir"` に更新される
- **AND** `settings.json` の `workspace_dir` が `"/path/to/dir"` に永続化される
- **AND** fs scope に `/path/to/dir` が許可される

### Requirement: 初回起動時の DirectoryPicker は単一操作で workspace を確定する

ユーザーが初回起動時の DirectoryPicker でディレクトリを選ぶフローでは、`pick_directory` の直後に `set_workspace_directory` を続けて呼ぶことで、これまでの単一操作と同じ UX を維持する SHALL。

#### Scenario: 初回選択時の連続呼び出し

- **WHEN** 初回起動の DirectoryPicker でユーザーがフォルダを選ぶ
- **THEN** `pick_directory` で取得したパスを引数に `set_workspace_directory` が直ちに呼ばれる
- **AND** App は workspace 確定済みの状態で Board に遷移する

#### Scenario: 初回選択時の Cancel

- **WHEN** 初回起動の DirectoryPicker でユーザーがピッカーを Cancel する
- **THEN** `set_workspace_directory` は呼ばれない
- **AND** App は DirectoryPicker 画面に留まる
