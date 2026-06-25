## Context

Cork は Tauri 2.11 ベースの macOS 専用 Kanban アプリ。配布は **GitHub Releases の DMG 直ダウンロード** と **Homebrew Cask (`koki-develop/homebrew-tap`)** の二経路。Apple Developer Program には加入していないため、`.app` は ad-hoc 署名（`codesign --sign -`）。現状の Cask は `preflight` で再 codesign + `xattr -dr com.apple.quarantine` を実行することで Gatekeeper をすり抜けている。

更新フローはユーザー任せ：DMG 再ダウンロード、または `brew upgrade --cask cork`。アプリ起動中にバージョン更新を促す手段は存在しない。リリース告知から実際の更新までの導線が極端に長く、また Brew 利用者と DMG 直ダウンロード利用者で更新時の挙動が分かれている。

主要な制約：

- **Apple Developer ID を取得しない**（year-cost と署名運用負担の回避）
- **macOS のみサポート**（cross-platform は将来検討）
- **ad-hoc 署名のまま macOS Gatekeeper を回避できる必要がある**
- **既存配布経路（DMG / Brew）を破壊しない**
- **設定の永続化基盤は `tauri-plugin-store` 既存利用パターンに揃える**（`mcp` キーと同居）

参考: 既存 OpenSpec spec `openspec/specs/mcp-server/spec.md` が設定永続化 / 起動時動作 / 設定 UI 設置の手本になる（同じ `SettingsDialog` に並べる）。

## Goals / Non-Goals

**Goals:**

- アプリ起動時に自動で最新版チェック → 検出時はダイアログで更新を促す
- メニュー / Settings から手動チェックが可能
- 1 クリックで「ダウンロード → インストール → 再起動」が完結する
- Apple Developer ID なしで成立する（minisign + ad-hoc codesign の組み合わせ）
- Brew Cask 利用者でも DMG 直ダウンロード利用者でも同じ体験
- 既存配布経路（DMG / Brew）は壊さない、むしろ補完する
- リリース運用は既存の `release-please.yml` を拡張するだけで完結（手動操作を増やさない）

**Non-Goals:**

- Windows / Linux サポート
- Delta update / 部分更新
- ロールバック機能（旧バージョンへの自動ダウングレード）
- 公開鍵ローテーション機構（初回鍵を恒久的に運用、再生成は新メジャーバージョンとして手動で告知）
- TCC 継続性のための custom designated requirement のビルド時統合（現状の Cask preflight 相当のカスタム DR）— 初回リリース後の挙動次第で別 change として検討
- App Store 配信対応
- 自走更新の頻度カスタマイズ（時間ベースの定期再チェック、起動 1 回のみ）

## Decisions

### Decision 1: `tauri-plugin-updater` を採用（Sparkle / 自前ではなく）

**選択**: 公式の `tauri-plugin-updater` 2.10.x を使う。

**根拠**:

1. **Tauri 公式・ファーストパーティ**で Tauri 2.11 と既知の互換。stable リリース系列で 2026/4 の最新が 2.10.1。
2. **Apple Developer ID 不要**：minisign による独立署名スキーム。`tauri-plugin-updater` の macOS 実装は `reqwest` でメモリにダウンロードして `tar` 展開し `std::fs::rename` で配置するため、`com.apple.quarantine` xattr が一切付かず Gatekeeper の「downloaded application」プロンプトが発動しない。ソース上で確認済（`plugins/updater/src/updater.rs` の `#[cfg(target_os = "macos")] install_inner`）。
3. **Tauri エコシステムとの整合**：`@tauri-apps/plugin-process` の `relaunch()` と組み合わせるだけで再起動まで完結。Tauri capabilities システムでパーミッション管理。
4. **CI 統合**：`tauri build` が `bundle.createUpdaterArtifacts: true` で `.app.tar.gz` + `.app.tar.gz.sig` を自動生成。`TAURI_SIGNING_PRIVATE_KEY` の env で署名する。

**代替案検討**:

- **Sparkle (macOS の de-facto updater)**: Apple Developer ID なしでも EdDSA 署名で動くが、Swift framework として Tauri から呼ぶには Swift sidecar ブリッジが必要。コミュニティ製ブリッジは存在するが採用例が極小。Tauri 公式プラグインが要件を満たすため不採用。
- **自前実装**: HTTP fetch + tar 展開 + bundle 置換 + 再起動を Rust で書く。コードは書けるが、minisign 検証 / 部分書き込み事故対策 / Apple Silicon の codesign 要件 / quarantine 回避ロジック等のエッジを再発明することになる。`tauri-plugin-updater` が既に枯れた実装なので不採用。
- **電子メール / GitHub Notifications による告知のみ**: 自動化されないので根本的に課題を解決しない。

### Decision 2: 署名は minisign + ad-hoc codesign の二段構え

**選択**:

1. **minisign**（`tauri-plugin-updater` 同梱）で `.app.tar.gz` の真正性を検証
2. **ad-hoc codesign**（`tauri.conf.json` の `bundle.macOS.signingIdentity: "-"`）でビルド時に `.app` を ad-hoc 署名

**根拠**:

- minisign の役割: 攻撃者が github.com を MITM / hijack して偽 `.app.tar.gz` を配信する経路を遮断。クライアントは tar.gz をダウンロード後、`.sig` を `plugins.updater.pubkey` の公開鍵で検証してから展開する。
- ad-hoc codesign の役割: Apple Silicon は「無署名バイナリの起動を拒否」する。ad-hoc 署名は Apple Developer ID なしで満たせる最小要件。**この署名を `.app.tar.gz` に焼き込んだ状態でリリースする** 必要があり、`bundle.macOS.signingIdentity: "-"` で Tauri build に組み込むのが最も確実。
- 「`tauri-plugin-updater` のダウンロードは quarantine xattr を付けない」性質と組み合わせて、Gatekeeper をすり抜けつつ Apple Silicon 要件を満たすことができる。

**代替案検討**:

- **ad-hoc codesign を Cask preflight のみに頼る**（現状）: in-app updater で配信される `.app.tar.gz` には ad-hoc 署名が無いままになる。展開後に新 `.app` が Apple Silicon で起動できない可能性が高い。**不採用**（壊れる）。
- **CI で `codesign --sign -` を `tauri build` 後に手動実行**: Tauri 内蔵の signing hook を使うのと同等だが、Tauri 内蔵の方が一段確実（`tauri build` のフェーズ順序が `.app build → sign → tar` で固定されているため）。シンプルさで `bundle.macOS.signingIdentity: "-"` を採用。

**残課題（範囲外として明示）**:

- Cask の `preflight` は現状 `--identifier me.koki.cork` と `-r=designated => identifier "me.koki.cork"` で **TCC 継続性のためのカスタム designated requirement** を上書きしている。Tauri 標準の ad-hoc signing がどの designated requirement を生成するかは事前確認できておらず、もし違いがあれば in-app 更新後に TCC が再認証を要求する可能性がある。**初回リリース後の実機検証で評価**し、必要なら別 change として CI に custom codesign フェーズを追加する。

### Decision 3: 配信エンドポイントは GitHub Releases 上の静的 `latest.json`

**選択**: `https://github.com/koki-develop/Cork/releases/latest/download/latest.json`。GitHub Releases の「最新タグ」エイリアス機能で常に最新版の release アセットを参照する。

**根拠**:

- **追加インフラ不要**: API server / CDN を用意する必要がない。
- **既存配布経路と整合**: DMG も同じ release にアップロードされるため、updater 成果物と配布物が物理的に同一の場所にある。
- **`tauri-action` が一般的にこのパターンを採用**（コミュニティでよく見るパターン）。
- **「最新版エイリアス」が GitHub 側で自動更新**: 新 release が draft → published になった瞬間に `releases/latest/` が新タグを指す。

**代替案検討**:

- **Vercel / Cloudflare Workers / 自前 API server**: ロールバック / 段階配信 / A/B 配信が可能になるが、Cork の規模では over-engineering。不採用。
- **GitHub Pages の静的サイト**: アセットと別管理になり、リリースの atomic 性が失われる（タグ release と Pages デプロイのズレが起きうる）。不採用。

### Decision 4: Homebrew Cask に `auto_updates true` を追加

**選択**: `scripts/build-cask.ts` が出力する Cask 文字列に `auto_updates true` を追加。

**根拠**:

- `auto_updates true` は **「アプリが自走更新するから Brew は二重に更新しなくて良い」というヒント**。`brew upgrade --cask cork`（名前指定）は引き続き動作する（force install 相当）が、bare `brew upgrade` は Brew が `Cork.app/Contents/Info.plist` の `CFBundleVersion` を見て「ローカルが既に最新なら何もしない」（2026/4 の Homebrew/brew#21882 以降の挙動）。
- VSCode / Slack 等が採用する標準パターン。
- `version` を毎リリース更新する運用は既存の `release-please` がカバー（`package.json` の version をバンプ → `build-cask.ts` がそれを Cask に書く）。

**代替案検討**:

- **`auto_updates` を追加しない**: in-app updater と `brew upgrade` の二重更新が時々発生する。壊れはしないが冗長。不採用。
- **Brew 経由インストールでは in-app updater を無効化**: 検出方法（`$(brew --prefix)/bin/cork` シンボリックリンク有無）がフラジャイル。さらに「Brew 経由なら brew upgrade に一本化」が暗黙の前提となるが、ユーザーは brew を毎日叩かない。不採用。

### Decision 5: 自動チェックは常に有効、`main` Window で起動時 1 回のみ

**選択**:

- 自動チェックは **常に ON**、ユーザー設定として公開しない（ON/OFF トグルは設置しない）
- 自動チェックは **`getCurrentWebviewWindow().label === "main"` の Window でだけ** `useUpdater` のマウント時 (`useEffect`) に 1 回だけ実行する
- 検出時は `main` Window にのみ toast を出す。他の `workspace-N` Window では auto-check を一切起動しない

**根拠**:

- **常時 ON / opt-out 削除**: 当初は Settings 画面に ON/OFF トグルを設置する案だったが、実装直前に「自動チェック OFF にしたいユースケースが想定できない、UI が増えるだけ」と判断し、ユーザー制御を撤廃。永続化設定もこれに合わせて削除（Decision 6 参照）。VSCode / Slack 等の標準慣行は opt-out だが、Cork はその opt-out すら無くした。
- **`main` Window 限定で auto-check を実行**: Cork の multi-window アーキテクチャ（`tauri-plugin-single-instance` 経由）では、各 Window が独立した React tree を持つ。素朴に `App.tsx` で `useUpdater` を呼ぶと、新しい `workspace-N` Window が開かれるたびに重複した auto-check が走る。`main` ラベルは **プロセスのライフタイムで必ず最初の Window 1 つにだけ** 付与され（既存の `lib.rs` の `MAIN_WINDOW_LABEL` 定数で固定、新規 Window は `workspace-<n>` を取得）、closed window のラベルが再利用されることもない。これにより「プロセス全体で auto-check 1 回」を **追加のロックや state を持たずに** ラベル比較だけで実現できる。
- **起動時 1 回のみ**: 長時間起動状態を維持するワークフローで、何時間も後に「更新があります」通知がいきなり出るのはノイズ。次回起動時の自動チェックで十分捕捉できる。

**代替案検討**:

- **`AppState` に `AtomicBool` の auto-check claimed フラグを追加**: より厳密だが、各 Window 側の `useUpdater` が Rust コマンド `try_claim_auto_check` を呼んで結果次第で実行する必要があり、JS 側にラウンドトリップが増える。`main` ラベル比較で済むなら不要。不採用。
- **Rust の `setup()` で auto-check を走らせ、結果を event で全 Window に emit**: 最も「process-singleton」として正しい設計だが、`tauri-plugin-updater` の Rust API（`app.updater()` の正確な extension trait）の確認が未完。JS 側の `check()` は実機検証済みのため、まずは JS 側 + `main` ゲートで実装し、必要が出れば Rust 化を後続 change で検討。
- **定期再チェック（例: 4 時間ごと）**: 長時間起動ユーザー向けには良いが、Cork はバックグラウンドで常駐するアプリでもないため過剰。複雑化を避けて不採用。

**残課題（edge cases）**:

- **`main` Window が auto-check 完了前に閉じられた場合**: JS のチェック promise は abandon され、その session では通知が表示されない。次回起動時の auto-check で再キャプチャされるため、UX 上は許容可能。
- **`main` 閉鎖後に `workspace-N` のみで稼働している間に新リリースが出ても気付けない**: 起動 1 回のみ仕様の延長で、現セッションでは検知不可。次回起動で対応。

### Decision 6: 設定永続化なし

**選択**: `tauri-plugin-store` の `settings.json` には **触れない**。updater に関する永続化キーは設けない。

**根拠**:

- 当初案では `updater.{autoCheck, lastCheckedAt}` を `mcp` キーと並列に保存する設計だった。
- Decision 5 で自動チェックを常時 ON 化したため `autoCheck` キーが不要に。
- `lastCheckedAt` も Settings 画面の「最終チェック時刻」表示用として設計したが、Settings 画面に Update セクションを設けない方針に転換したため表示先が消えた。
- 残った永続化対象がゼロになったので、`updater.rs` モジュール自体を削除、`get_updater_settings` / `update_updater_settings` / `get_app_version` Tauri command も全削除、`UpdaterSettings` 型も削除した。

**代替案検討**:

- **`lastCheckedAt` だけ残して表示しない**: 使わない値を毎起動書き込むのは無駄。NO。
- **Rust 側に小さい状態を残す**: モジュールがゼロライナーに近くなる。維持コストに見合わない。NO。

### Decision 7: macOS メニューに `Check for Updates...` を追加（`menu.rs` の `app_menu`）

**選択**: `app_menu` の `about()` 直後（separator なし）に `Check for Updates...` メニュー項目を挿入。menu event は `focused_webview_window` パターンで focused Window に `menu:check-for-updates` イベントを emit。フロントエンドが listen して `useUpdater` の手動チェックフローをトリガー。

**根拠**:

- **macOS 標準慣行**: 大半のアプリが `<AppName>` メニューの `About <AppName>` 直後に置く。
- **既存パターンと整合**: `settings` / `new_task` メニューが既に `focused_webview_window` + `emit_to` パターンで実装されている。同じ書き方で追加できる。
- **メニュー項目の `id` は `"check_for_updates"` で十分**（既存の `settings` / `new_task` / `reload` と同じ短い snake_case）。

**代替案検討**:

- **Settings 画面の中だけに置く**: macOS の慣習から外れる。NO。
- **ツールバー / バッジ**: 常時表示は UI ノイズ、また Cork はメニューバーアプリではないため不適切。NO。

### Decision 8: UI は sonner toast、専用ダイアログは設けない

**選択**: 更新通知は中央 modal ではなく **右下の sonner toast** として表示し、state machine を sonner の同 id update セマンティクスにブリッジする。実装は `organisms/shell/UpdaterToast.tsx` 1 ファイルに集約（null を返し、副作用で sonner を駆動）。

ファイル構成：

- `src/components/organisms/shell/UpdaterToast.tsx` — `useUpdater` の state を sonner に橋渡しする organism。`available → downloading → installing → (success or error)` を同じ toast id で in-place 更新
- `src/hooks/useUpdater.ts` — 状態管理（idle / checking / available / downloading / installing / error）+ 起動時自動チェック（`main` Window 限定ゲート、Decision 5）+ menu イベント listen
- `src/types/updater.ts` — `UpdaterState` 型のみ。`@/components` から `@/hooks` への import を禁ずる oxlint ルールを回避するため `@/types` に置く
- `src/api/updater.ts` — `@tauri-apps/plugin-updater` (`checkForUpdate` / `downloadAndInstall`) と `@tauri-apps/plugin-process` (`relaunchApp`) の薄ラッパーのみ。Rust コマンドラッパーは存在しない（Rust 側 updater モジュールが無いため）

**根拠**:

- **当初案からの転換**: 初稿では `organisms/shell/UpdateAvailableDialog.tsx`（中央 modal）+ `UpdateProgressDialog.tsx`（中央進捗 modal）+ `organisms/settings/UpdaterSection.tsx`（Settings UI）の 3 ファイル構成だった。UI 確認段階で「画面中央 modal は作業を邪魔する」「リリースノート本文は不要、Release notes リンクのみで十分」「Settings の Update セクションは不要」とのフィードバックで全面再設計。
- **sonner ネイティブ採用**: 自前 fixed-position コンポーネント案も検討したが、sonner の `toast.custom(jsx, { duration: Infinity })` で同じ右下スタックに統合した方が、他 toast（Task deleted 等）との位置調整・animation・stacking・theming が全部タダで揃う。実装も 100 行台に収まる。
- **state ↔ toast 同期は同 id update**: `toast(...)` / `toast.loading(...)` / `toast.error(...)` を同じ `TOAST_ID` で呼ぶと sonner が `{...prev, ...next}` で merge して in-place 更新する。`available` → `downloading` の遷移を「同じカードが姿を変える」UX として表現できる。
- **sonner option bleed-through 対策**: `available` 時に設定した `action` / `closeButton` / `onDismiss` が下流 state でも継承されるため、各 case で明示的に `undefined` にリセットする（spec 参照）。
- **mount race / X クリック race 対策**: `prevKindRef` を導入し、「直前のレンダーで visible だった時だけ `toast.dismiss(id)` を呼ぶ」ロジックで、sonner 内部の `requestAnimationFrame` 経由の遅延 dismiss event 配信に起因する「toast が一瞬出てすぐ消える」race を回避（spec.md 内 Scenario「action ボタンクリック時の sonner 自動 dismiss 抑制」参照）。
- **action ボタンの自動 dismiss 抑制**: sonner は action click 後にデフォルトで toast を auto-dismiss する。`event.preventDefault()` で抑制してから `installAndRestart()` を発火し、同 id で `toast.loading(...)` に in-place 更新する。
- **数字レンダリング**: ダウンロード進捗テキスト（バイト数・%）は `tabular-nums` で各桁等幅化し、桁ズレによる横ガタつきを排除（Inter フォントの OpenType `tnum` feature を活用）。

**代替案検討**:

- **`sonner.toast.custom` で完全自作 JSX**: 状態管理が複雑化（progress 更新の度に毎フレーム JSX 再生成）、sonner の reducer dispatch が肥大化。NO。
- **`organisms/updater/` 新規ドメインフォルダ**: `.oxlintrc.json` のクロスドメインルール追加が必要、保守コスト増。dialog は `shell/`（app-chrome overlay）に置くだけで足りる。NO。
- **macOS NSUserNotification の native 通知**: dark UI 文脈で浮く、Cork 既存のテーマと不整合。NO。

### Decision 8a: Settings 画面の Update セクションは設置しない

**選択**: `SettingsDialog` には Update セクションを設けない（autoCheck トグル、最終チェック時刻、Check Now ボタンはいずれも非表示）。

**根拠**:

- Decision 5 / Decision 6 と同期した方針。自動チェック ON/OFF を撤廃し、永続化も廃止したため、Settings 画面に表示する状態がゼロ。
- 「現バージョン表示」だけ残す案も検討したが、`Cork > About Cork...` で代用可能のため単独セクションを設ける価値が乏しい。

**代替案検討**:

- **About ダイアログに統合**: 既存の `about()` メニュー項目は macOS 標準を流用しており、カスタマイズコストに見合わない。NO。

### Decision 9: CI 拡張は `.github/workflows/release-please.yml` の既存 `build` / `release` ジョブを拡張

**選択**:

- **`build` ジョブ**: 既存ステップ `bun run tauri build` の env に `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を追加。upload-artifact のパスを `src-tauri/target/release/bundle/macos/*.app.tar.gz*` も含むように拡張（または新規 step として upload）
- **`release` ジョブ**: `artifacts/` から `.app.tar.gz` と `.sig` を `gh release upload` で release に push。続けて `scripts/build-update-manifest.ts`（新規）が `latest.json` を生成し、それも `gh release upload` で push。
- **新規 script**: `scripts/build-update-manifest.ts` は version + signature 文字列 + URL + リリースノート本文を組み立てて `latest.json` を書き出す。引数: `--version`（`v` プレフィックス無しの SemVer）、`--signature`（`.sig` ファイルパス）、`--notes`（リリースノート本文、optional / 省略時は release URL のリンクを fallback で埋める）、`--out`（出力パス）。CI 側で `gh release view "$TAG_NAME" --json body --jq .body` を呼んで release body（release-please が CHANGELOG エントリを書き込んでいる）を `--notes` に渡す。`$TAG_NAME` は `v0.16.0` 形式なので、`build-cask.ts` と同じく `${TAG_NAME#v}` で剥がして `--version` に渡す。

**根拠**:

- 既存ワークフローに馴染ませる。新規ジョブを増やすと依存関係（needs）が肥大化する。
- `latest.json` は `release` ジョブで生成して `gh release upload` するのが最も atomic（DMG / tar.gz / sig がすべて揃った release に対して manifest を貼る）。
- `scripts/` ディレクトリは既存パターン（`build-sidecar.ts` / `build-cask.ts`）と整合。
- `notes` に CHANGELOG 本文を inline することで、将来 UI 表示する場合や外部 client が release 情報を参照する場合に有用。release-please が既に release body を書き込んでいるので、追加運用コストはゼロ。実装段階の UI 再設計でリリースノート本文は toast 表示から外れたが、`latest.json` の `notes` フィールドは互換性のため引き続き埋める。

**代替案検討**:

- **`tauri-action` を使う**: 既存ワークフローを `tauri-action` に置き換える大改修になる。今は最小変更で `tauri build` + `gh release` の薄い組み合わせで動いており、それを残したまま updater 成果物を追加する方が変更スコープが狭い。不採用。
- **`notes` 自体を埋めない**: `tauri-plugin-updater` の `latest.json` スキーマでは optional だが、サードパーティが manifest を読みに来た時の情報量が落ちる。CHANGELOG 本文の inline が CI コスト ゼロで取れるので埋める。

### Decision 10: 公開鍵は `tauri.conf.json` にハードコード、鍵ローテーションは将来課題

**選択**: minisign 鍵ペアはメンテナがローカルで生成（`bun run tauri signer generate`）→ 公開鍵を `tauri.conf.json` の `plugins.updater.pubkey` に直書き、秘密鍵を GitHub repo Secrets に登録。

**根拠**:

- 公開鍵は公開情報なのでリポジトリにコミットして問題なし。
- 鍵ローテーションは「クライアント側で旧鍵を信頼している既存ユーザー」が存在する以上、新鍵での署名は受け付けられず、原理的に困難。Sparkle / Tauri エコシステム共通の課題。
- 初回鍵を恒久的に運用する前提とする。秘密鍵紛失時は「Brew で再インストールしてください」と告知（緊急回避）。

**範囲外**: 鍵ローテーション機構（multi-pubkey 信頼 / 旧鍵で署名した「橋渡しリリース」など）は別 change。

## Risks / Trade-offs

| Risk                                                                                                                                        | Mitigation                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauri-plugin-updater` の macOS 実装が将来バージョンで quarantine xattr を付けるよう変わると Gatekeeper ブロックされる                      | Tauri リリースノートを CI 更新時にチェック。回避策として post-install hook で `xattr -cr` を自前で実行する保険コード（Decision 2 と同じ tier の defensive measure）を後続 change で追加可能 |
| Brew Cask の preflight と Tauri 内蔵 ad-hoc codesign で designated requirement が異なると、in-app 更新後に TCC が再認証要求する             | 初回リリース後に実機検証（Cork の TCC 権限が残るか）。問題があれば custom codesign を CI に追加する別 change                                                                                |
| 秘密鍵漏洩時に攻撃者が偽更新を配信できる                                                                                                    | GitHub Secrets の通常通りの管理。漏洩時は新鍵で「強制 brew upgrade」リリースを行いつつ、ユーザーに新鍵版への手動更新を告知                                                                  |
| ダウンロード中にアプリを `Cmd+Q` で終了されると中間ファイルが tempdir に残る                                                                | macOS は再起動時に `$TMPDIR` を自動クリーンアップ。問題なし（spec の Scenario「進捗ダイアログ表示中の Window クローズ」で明示）                                                             |
| `latest.json` のスキーマが Tauri 側でバージョンアップして変わる                                                                             | minor version pin で防御（`tauri-plugin-updater = "=2.10.x"` 形式）。Tauri アップデート時に手動レビュー                                                                                     |
| 自走更新後に旧設定 (`settings.json`) が新バージョンで読めない                                                                               | updater 自体は永続化を持たない（Decision 6）ため発生しない。他キー (`mcp` 等) の互換性は各キーの担当が保証                                                                                  |
| Apple Silicon 専用ビルドのまま x86_64 ユーザーが Cork を使い始めると `latest.json` に該当プラットフォームキーが無くサイレントに更新が来ない | これは現状の Cask が aarch64-only であることと整合。Issue として残し、x86_64 サポートを追加するとき同時に `latest.json` も拡張                                                              |
| `tauri-plugin-updater` 2.10.x が Tauri 2.11.x と非互換                                                                                      | プラグイン側 README で 2.x 系互換とされている。実装着手時に CI ビルドで早期検証する                                                                                                         |
| 常時 ON の自動チェックで GitHub に対する負荷                                                                                                | クライアント数 × 起動回数で発生するが、`latest.json` は数百バイトの静的ファイルで GitHub releases は無限スケール。問題なし                                                                  |
| 同じ id で sonner toast を update する race                                                                                                 | `prevKindRef` で visible 状態からの遷移時のみ `toast.dismiss(id)` を呼ぶ実装で sonner 内部 RAF dismiss event の遅延配信問題を回避（spec Scenario 参照）                                     |

## Migration Plan

1. **鍵ペア生成（メンテナがローカルで一度）**: `bun run tauri signer generate -w ~/.tauri/cork-updater.key`（パスワードあり）。`cork-updater.key` と `cork-updater.key.pub` を生成。
2. **公開鍵を `tauri.conf.json` に書き込む**（コミット対象）。秘密鍵と password を GitHub Secrets に登録：`TAURI_SIGNING_PRIVATE_KEY`（鍵ファイル中身）と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
3. **`tasks.md` の順序で実装** — Rust → frontend → CI → Cask の順。
4. **既存リリース 0.15.0 までのユーザーへの影響**: 既存ユーザーには「次の手動更新（DMG 再ダウンロード or `brew upgrade --cask cork`）まで」自走更新は届かない。これは仕様上避けられない（既存ビルドに updater コードが入っていない）。リリースノートで一度だけ手動更新を案内する。
5. **初回 updater 対応リリース後の検証**:
   - 0.15.0 → 0.16.0（updater 入り）の更新は手動。
   - 0.16.0 → 0.16.1（テストリリース）で in-app updater フロー全体を実機検証。
6. **検証項目**:
   - 自動チェック toast 表示（`Cork x.y.z is available`）
   - `Install and Restart` → ダウンロード進捗 → installing → 再起動が成功する
   - 再起動後 Gatekeeper プロンプトが出ない
   - 再起動後 `codesign --display /Applications/Cork.app` が `Signature=adhoc` 相当
   - 再起動後 TCC 権限（フルディスクアクセス等）が継続している
   - `cork-cli` シンボリックリンクが新版を指す
   - `brew list --cask --versions cork` が新バージョンを認識する（または bundle_version 比較で `brew upgrade` がスキップする）

**Rollback strategy**: in-app updater 自体に問題があれば、新リリース版の `tauri.conf.json` で endpoint を空文字列にして自動チェックを無効化（あるいは `plugins.updater` ブロック自体を削除）。既存ユーザーには「`brew upgrade --cask cork` か手動 DMG で復旧してください」と告知。

## Open Questions

- **0.15.0 までの既存ユーザーへのワンタイム告知**: 0.16.0 リリース時のリリースノートで「次回からは自動更新される」と告知するか、アプリ内 1 回限りの toast を出すかは未定。今回の change のスコープでは "リリースノート上の告知だけ" で十分とするが、UX 上の判断は実装時。
- **Tauri 2.12 / 2.13 への将来アップグレード時の updater 挙動変化**: 影響大の変更があれば CHANGELOG で気付けるよう、`tauri-plugin-updater` を patch pinning（`=2.10.1` 形式）にする。
- **エラー後のリトライ導線**: 現状は error toast の X で閉じるのみ、再試行は次回起動の auto-check か手動 `Check for Updates...` を待つ必要がある。retry action ボタンの追加は別 change で検討。
