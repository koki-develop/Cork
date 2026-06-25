# updater Specification

## Purpose

Cork にアプリ起動中の自走更新機能を組み込み、ユーザーが手動 DMG 再ダウンロードや `brew upgrade` を実行することなく最新リリースへ移行できるようにする。Apple Developer Program に加入しない方針のため、minisign による独立署名（`tauri-plugin-updater` 内蔵）と Tauri ビルド時の ad-hoc codesign の二段構えで真正性検証と macOS Apple Silicon の起動要件を両立する。UI は `organisms/shell/UpdaterToast` が `useUpdater` の state machine を sonner にブリッジし、`available → downloading → installing → (relaunch or error)` を右下の同一 toast 内で in-place 遷移させる。自動チェックは設定として公開せず常時有効、`main` Window で起動時 1 回のみ走り、複数 Window 開いた状態でも重複しない。配信は GitHub Releases 上の静的 `latest.json` 単一エンドポイント、Homebrew Cask は `auto_updates true` を宣言して in-app updater との二重更新を回避する。

## Requirements

### Requirement: アプリは起動時に最新リリースを自動チェックする

Cork プロセスは、`getCurrentWebviewWindow().label === "main"` を満たす Window 上で `useUpdater` フックがマウントされた直後の `useEffect` 1 回に限り、`@tauri-apps/plugin-updater` の `check()` を呼び出して `latest.json` を取得し、内部で SemVer 比較しなければならない (MUST)。`latest.json` の `version` が現バージョンより新しい場合に限り、`main` Window の sonner toast スタックに更新通知を表示しなければならない (MUST)。`main` 以外のラベル (`workspace-<n>`) を持つ Window では自動チェックを起動してはならない (MUST NOT、ただし手動チェックは除く)。自動チェックの ON/OFF はユーザー設定として公開せず、常に有効でなければならない (MUST)。

#### Scenario: 自動チェックで最新バージョンあり

- **WHEN** `main` Window で起動し、`latest.json` の `version` が現バージョンより新しい
- **THEN** 起動から数秒以内に「Cork x.y.z is available」の sonner toast (action ボタン `Install and Restart` + 閉じる X + `Release notes ↗` リンク) が右下に表示される
- **AND** toast は `duration: Infinity` で自動クローズしない

#### Scenario: 自動チェックで最新

- **WHEN** `main` Window で起動し、`latest.json` の `version` が現バージョン以下である
- **THEN** UI には何も表示されない (toast / バッジいずれも出さない)

#### Scenario: ネットワークエラー (自動チェック時)

- **WHEN** 自動チェック中にネットワーク到達不能 / DNS 失敗 / HTTP 5xx / minisign 検証失敗のいずれかが発生する
- **THEN** UI には toast を**表示しない** (起動時ユーザーアテンションを奪わない)
- **AND** エラーは `console.error` に記録される
- **AND** 次回起動時に通常通り再試行される

#### Scenario: 追加 Window (`workspace-<n>`) では自動チェックを起動しない

- **WHEN** 既にアプリプロセスが稼働しており、`cork <dir>` または `File > New Window` 等で追加 Window (`workspace-<n>` ラベル) を開いた
- **THEN** その Window の `useUpdater` はマウント時にラベルが `main` 以外と判定するため、`check()` を一切呼ばない
- **AND** 既存の `main` Window で auto-check 済みの場合の toast も追加 Window には表示されない
- **AND** ただし `Cork > Check for Updates...` メニューによる手動チェックはこの追加 Window でも引き続き使用可能

#### Scenario: `main` Window が auto-check 完了前に閉じられた

- **WHEN** `main` Window で auto-check 進行中（`check()` の Promise resolve 前）にユーザーが `main` Window を閉じる
- **THEN** その Window の React tree がアンマウントされ、Promise は abandon される
- **AND** 次回起動時の auto-check で再試行される

### Requirement: ユーザーは手動で更新チェックを実行できる

ユーザーは macOS メニュー `Cork > Check for Updates...`（`Cork` サブメニューの `about` 直後に配置）から、手動チェックを任意のタイミングで実行できなければならない (MUST)。手動チェックは自動チェックと異なり、結果が「最新」「更新あり」「エラー」のいずれであっても UI で明示的にフィードバックしなければならない (MUST)。

#### Scenario: 手動チェックで更新あり

- **WHEN** ユーザーがメニュー `Cork > Check for Updates...` を選択し、`latest.json` の `version` が現バージョンより新しい
- **THEN** フォーカスされた Window に自動チェックと同じ「Update available」toast が表示される

#### Scenario: 手動チェックで最新

- **WHEN** ユーザーが手動チェックを実行し、現バージョンが最新
- **THEN** 「Cork is up to date.」を伝える sonner toast (info レベル、duration 4 秒で自動クローズ) が表示される
- **AND** action ボタン無し、close button 無し

#### Scenario: 手動チェックでネットワークエラー

- **WHEN** 手動チェック中にネットワークエラー / 署名検証失敗等が発生する
- **THEN** 「Update check failed: <reason>」の sonner toast (error レベル) が表示される

#### Scenario: メニュー項目のフォーカス Window 選定

- **WHEN** 複数 Window が開いている状態で `Cork > Check for Updates...` を選択する
- **THEN** その時点でフォーカスを持っている Window に対してチェック開始イベントが emit される (既存の `menu.rs::focused_webview_window` と同じパターン)
- **AND** どの Window もフォーカスを持たない場合はイベントが無視される (`settings` / `new_task` と同じ挙動)

### Requirement: 更新通知 toast からダウンロード・インストール・再起動を完結できる

`Update available` toast の `Install and Restart` action ボタンが選択された場合、同じ toast id を保持したまま sonner の状態を遷移させ、`tauri-plugin-updater` の `downloadAndInstall` を呼び出さなければならない (MUST)。状態遷移は `available → downloading → installing → (relaunch or error)` の順で同じ toast を update することで実現しなければならない (MUST)。インストール完了後、`@tauri-apps/plugin-process` の `relaunch()` を呼び出してアプリを新バージョンで再起動しなければならない (MUST)。`available` 時の X クリックは toast を閉じて何もせず終了し、同セッション中の再通知を行ってはならない (MUST NOT、ただし手動チェックでの再表示は許可)。

#### Scenario: action ボタンクリック時の sonner 自動 dismiss 抑制

- **WHEN** ユーザーが `Install and Restart` をクリックする
- **THEN** sonner の action onClick handler は `event.preventDefault()` を呼び、sonner のデフォルト自動 dismiss を抑制する
- **AND** その後 `useUpdater.installAndRestart()` が発火し、state が `downloading` に遷移する
- **AND** useEffect 経由で同じ toast id に `toast.loading(...)` が呼ばれ、toast の中身が「Downloading Cork x.y.z」+ 進捗バーに in-place 更新される

#### Scenario: ダウンロード進捗表示

- **WHEN** ダウンロード中（state が `downloading`）
- **THEN** toast title は「Downloading Cork x.y.z」
- **AND** description には determinate な progress bar (`bg-cork-accent` の塗りバー) + 「2.5 MB / 8 MB · 31%」形式の数値テキスト
- **AND** 数値テキストは `tabular-nums` で各桁等幅レンダリング、`text-cork-muted text-[11px]` で控えめな見た目
- **AND** sonner の `toast.loading()` のデフォルトスピナーが描画される
- **AND** toast は close button 無し、`dismissible: false` でユーザー操作で閉じられない（中断不可）

#### Scenario: インストール段階の表示

- **WHEN** ダウンロード完了直後（plugin が `Finished` イベントを emit）
- **THEN** state が `installing` に遷移し、toast title は引き続き「Downloading Cork x.y.z」（連続体験を保つため title は変えない）
- **AND** description が「Restarting shortly…」（`text-cork-muted text-[11px]` スタイル）に更新される

#### Scenario: 再起動

- **WHEN** `downloadAndInstall` が成功完了する
- **THEN** `relaunch()` が呼ばれ、アプリは新バージョンで再起動する
- **AND** ユーザーに codesign / Gatekeeper / quarantine のプロンプトが表示されない (`reqwest` 経由 in-process ダウンロードのため `com.apple.quarantine` xattr が付かない)

#### Scenario: ダウンロード失敗

- **WHEN** ダウンロード途中でネットワークが切断される、または minisign 署名検証に失敗する
- **THEN** 同じ toast id で `toast.error("Update failed", { description: <reason> })` が呼ばれ、エラー表示に in-place 更新される
- **AND** action ボタン、`onDismiss`、`closeButton` 等の以前 state からの option は明示的に `undefined` にリセットされ、bleed-through しない
- **AND** アプリは現バージョンのまま継続稼働する (ロールバック等は行わず、何も置き換えない)
- **AND** 次回起動時に通常通り自動チェックが走る

#### Scenario: ユーザーが available toast の X をクリック

- **WHEN** ユーザーが `Update available` toast の close button (X) をクリックする
- **THEN** sonner が toast を dismiss し、`onDismiss` callback で `useUpdater.dismiss()` が呼ばれ、state が `idle` に戻る
- **AND** 同プロセス中は自動チェック由来の更新通知が再表示されない (次回起動時の自動チェックで再度通知される)
- **AND** ただし手動チェック (`Cork > Check for Updates...`) からの再表示は可能

### Requirement: 更新成果物は minisign で署名され公開鍵で検証される

CI でビルドされる `Cork.app.tar.gz` は、`TAURI_SIGNING_PRIVATE_KEY` (minisign 秘密鍵) と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を環境変数として受け取った `tauri build` が同名の `.sig` ファイル (base64 minisign) を生成し、release アセットとしてアップロードされなければならない (MUST)。クライアント側は `tauri.conf.json` の `plugins.updater.pubkey` にハードコードされた公開鍵で `.sig` を検証しなければならない (MUST)。検証失敗時はインストールを中止しなければならず (MUST)、`.app` バンドルを置き換えてはならない (MUST NOT)。

#### Scenario: 正規署名

- **WHEN** `latest.json` の `signature` フィールドに正しい minisign 署名が記載されており、対応する公開鍵がアプリにハードコードされている
- **THEN** ダウンロードした tar.gz は検証成功し、インストールフェーズに進む

#### Scenario: 署名改竄

- **WHEN** `latest.json` の `signature` が攻撃者により別の (公開鍵で検証できない) 値に書き換えられた
- **THEN** クライアントは検証エラーとしてインストールを中止する
- **AND** state が `error` に遷移し、updater toast が `toast.error("Update failed", { description: <reason> })` に in-place 更新される
- **AND** `.app` バンドルは置き換わらない

#### Scenario: 公開鍵不一致

- **WHEN** 攻撃者が偽の tar.gz を別の秘密鍵で署名して配信したが、アプリにハードコードされた公開鍵では検証できない
- **THEN** 検証エラーで中止される (上記 Scenario と同じ挙動)

### Requirement: アプリは ad-hoc 署名のまま自走更新可能でなければならない

ビルド時、`tauri.conf.json` の `bundle.macOS.signingIdentity: "-"` によって Tauri が `.app` を ad-hoc 署名しなければならない (MUST)。`tauri-plugin-updater` が新 `.app` を `reqwest` でメモリにダウンロードし、`tar` 展開してから `std::fs::rename` で配置することで、`com.apple.quarantine` xattr が付かない状態を維持しなければならない (MUST)。これにより Gatekeeper の「downloaded application」ブロックを発動させてはならない (MUST NOT) し、Apple Silicon の「未署名バイナリ起動拒否」を ad-hoc 署名で満たさなければならない (MUST)。

#### Scenario: 自走更新後の起動

- **WHEN** ユーザーが in-app updater で `Install and Restart` を選択し、`.app` バンドルが新バージョンに置き換わって `relaunch()` した
- **THEN** macOS の Gatekeeper / quarantine プロンプトは表示されない
- **AND** アプリは通常通り起動する
- **AND** 新 `.app` には ad-hoc 署名が保持されている (`codesign --display Cork.app` で `Signature=adhoc` 相当が確認できる)

#### Scenario: 同梱 CLI (`cork-cli`) の整合性

- **WHEN** 自走更新後に Homebrew Cask のシンボリックリンク `$(brew --prefix)/bin/cork` が指す `Cork.app/Contents/MacOS/cork-cli` を実行する
- **THEN** 新バージョンの `cork-cli` が起動する (シンボリックリンクのターゲットパスが不変であるため自動的に新バイナリへ繋がる)
- **AND** `cork --version` が新バージョン番号を返す (`cli/build.rs` が `package.json` の version を埋め込んでいるため)

### Requirement: 配信エンドポイントは GitHub Releases 上の静的 `latest.json`

`tauri-plugin-updater` の endpoint は `https://github.com/koki-develop/Cork/releases/latest/download/latest.json` 単一でなければならない (MUST)。`latest.json` は CI (`release-please.yml` の `release` ジョブ) で生成され、その release にアップロードされなければならない (MUST)。`platforms` キーは現状 `darwin-aarch64` のみを含まなければならない (MUST、現 Cask が aarch64-only のため)。

#### Scenario: latest.json の構造

- **WHEN** クライアントが endpoint URL に GET する
- **THEN** レスポンスは `{ "version": "x.y.z", "notes": "...", "pub_date": "<ISO 8601>", "platforms": { "darwin-aarch64": { "signature": "<base64 minisign>", "url": "https://github.com/koki-develop/Cork/releases/download/v<x.y.z>/Cork_<x.y.z>_aarch64.app.tar.gz" } } }` のスキーマに従う
- **AND** `version` は SemVer 形式 (`x.y.z`)
- **AND** `signature` は対応する `.app.tar.gz.sig` の中身そのまま (URL ではなく文字列)
- **AND** `notes` は release-please が release body に書き込んだ CHANGELOG エントリ (CI で `gh release view --json body --jq .body` 経由で取得)
- **AND** `pub_date` は RFC 3339 / ISO 8601 (オプショナルだが含める)
- **AND** UI 側は `notes` 本文を表示せず、`Release notes ↗` リンク経由で GitHub Release ページを開く形で利用する

#### Scenario: Rosetta 2 経由の x86_64 macOS ユーザー

- **WHEN** 現在の aarch64-only ビルドを x86_64 Mac 上の Rosetta 2 経由で起動したユーザーが auto-check する
- **THEN** プロセスは aarch64 として振る舞うため、`tauri-plugin-updater` は `darwin-aarch64` プラットフォームエントリを取得し、通常通り更新通知 toast を表示する
- **AND** Rosetta 2 経由でも自走更新は成功する

#### Scenario: 未対応プラットフォーム (将来の native x86_64 / Windows / Linux 対応時)

- **WHEN** native x86_64 / Windows / Linux ビルドが存在する将来時点で、それらのプラットフォーム上のクライアントが同 endpoint を参照する
- **THEN** `latest.json` に該当プラットフォームキーが存在しないため、`tauri-plugin-updater` は「対応版なし」として `null` 相当を返す
- **AND** クライアント UI は何も表示しない

### Requirement: Homebrew Cask は in-app updater と共存する

`scripts/build-cask.ts` の Cask 文字列に `auto_updates true` を追加しなければならない (MUST)。これにより bare `brew upgrade` は Cork の `.app` の `CFBundleVersion` を読んでローカルが古い場合のみ更新を実行する (Homebrew/brew#21882 以降の挙動)。`brew upgrade --cask cork` (名前指定) は従来通り常に更新を実行できなければならない (MUST)。Cask の `preflight` (ad-hoc 再 codesign + xattr 除去) は DMG 直インストール経路の保険として保持しなければならない (MUST)。

#### Scenario: Cask に auto_updates true が含まれる

- **WHEN** 新リリース後に `scripts/build-cask.ts` が走って `koki-develop/homebrew-tap` の `Casks/cork.rb` を更新する
- **THEN** 生成された `cork.rb` に `auto_updates true` 行が含まれる

#### Scenario: in-app updater 後の brew upgrade

- **WHEN** ユーザーが Cork を in-app updater で 0.16.0 に上げた後、`brew upgrade` (bare) を実行する
- **THEN** Brew は `Cork.app` の bundle version を 0.16.0 と認識し、Cask の version と一致するため何も再ダウンロードしない
- **AND** ローカルの `Cork.app` は破壊されない (in-app 更新の成果がそのまま残る)

#### Scenario: brew upgrade --cask cork (名前指定)

- **WHEN** ユーザーが `brew upgrade --cask cork` を明示的に実行する
- **THEN** Brew は version 比較に関係なく Cask を再インストール (DMG 再ダウンロード + preflight 再署名) する
- **AND** これはユーザーが意図的に行うリセット操作として機能する

### Requirement: 更新フローは Tauri capabilities で明示許可されている

`capabilities/default.json` に `updater:default` (check / downloadAndInstall を含む) と `process:default` (`relaunch` を含む) を追加しなければならない (MUST)。これにより全 Window (`main` および `workspace-*`) で updater API が呼べなければならない (MUST)。

#### Scenario: capabilities 追加後の API 呼び出し

- **WHEN** フロントエンドが `@tauri-apps/plugin-updater` の `check()` および `@tauri-apps/plugin-process` の `relaunch()` を呼ぶ
- **THEN** Tauri runtime は capability チェックを通過させる
- **AND** 「permission not granted」エラーは発生しない
