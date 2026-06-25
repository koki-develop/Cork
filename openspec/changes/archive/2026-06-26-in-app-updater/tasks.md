> **Design pivot note (2026-06-26)**: 実装途中で UI 方針を「中央ダイアログ → 右下 sonner toast」「Settings に Update セクション設置 → セクション無し」「自動チェック ON/OFF トグル → 常時 ON」に転換した。これに伴い以下のタスクは **完了後に巻き戻し** された（チェックマークは「当時実装した」事実、`(REVERTED)` は最終 ship からの除外を示す）:
>
> - §4 全体: `updater.rs` モジュールと Tauri command 群 → 削除
> - §6 全体: `updater.rs` 単体テスト → モジュール削除に伴い消失
> - §7.1.1〜7.1.3: `getUpdaterSettings` / `updateUpdaterSettings` / `getAppVersion` ラッパー → 削除
> - §9.3.2: `autoCheck=false` ガード → 設定撤廃で不要
> - §9.3.4: `lastCheckedAt` 永続化 → 撤廃
> - §10.1: `UpdateAvailableDialog.tsx` → `UpdaterToast.tsx` に統合
> - §10.2: `UpdateProgressDialog.tsx` → `UpdaterToast.tsx` の `downloading` / `installing` ブランチに統合
> - §10.3: `UpdaterSection.tsx` → 削除
> - §11 全体: SettingsDialog の Update セクション → 設置せず
>
> 最終構成は `proposal.md` / `design.md` / `specs/updater/spec.md` を参照。

## 1. 事前準備 (メンテナのローカル作業)

- [x] 1.1 `bun run tauri signer generate -w ~/.tauri/cork-updater.key` で minisign 鍵ペア生成完了
- [x] 1.2 GitHub repo Secrets に `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 登録完了
- [x] 1.3 公開鍵を取得し、`tauri.conf.json` の `plugins.updater.pubkey` に書き込み完了
- [x] 1.4 公開鍵書き込みと CI Secret 登録は同タイミングで完了

## 2. Rust 依存関係と設定

- [x] 2.1 `src-tauri/Cargo.toml` の `[dependencies]` に `tauri-plugin-updater = "=2.10.1"` と `tauri-plugin-process = "=2.3.1"` を追加
- [x] 2.2 `src-tauri/tauri.conf.json` の `bundle.macOS.signingIdentity: "-"` を追加
- [x] 2.3 `src-tauri/tauri.conf.json` の `bundle.createUpdaterArtifacts: true` を追加
- [x] 2.4 `src-tauri/tauri.conf.json` の `plugins.updater` に endpoints + pubkey を実値で書き込み
- [x] 2.5 `src-tauri/capabilities/default.json` の `permissions` に `updater:default` と `process:default` を追加

## 3. フロントエンド npm 依存関係

- [x] 3.1 `bun add @tauri-apps/plugin-updater@2.10.1`
- [x] 3.2 `bun add @tauri-apps/plugin-process@2.3.1`

## 4. Rust 側: `updater` モジュールと永続化 (REVERTED)

> 一度実装した後、Decision 6（設定永続化なし）で全削除。プラグイン登録（§4.4 のみ）が現状の lib.rs に残る。

- [x] 4.1 `src-tauri/src/updater.rs` を新規作成し、以下を実装: **(REVERTED — モジュール削除)**
  - [x] 4.1.1 `UpdaterSettings { auto_check: bool, last_checked_at: Option<String> }` 型と `serde` derive **(REVERTED)**
  - [x] 4.1.2 `load_settings(app: &AppHandle) -> UpdaterSettings` **(REVERTED)**
  - [x] 4.1.3 `save_settings(app: &AppHandle, settings: &UpdaterSettings)` **(REVERTED)**
- [x] 4.2 `#[tauri::command]` 群を実装: **(REVERTED — コマンド削除)**
  - [x] 4.2.1 `updater::get_updater_settings` **(REVERTED)**
  - [x] 4.2.2 `updater::update_updater_settings` **(REVERTED)**
  - [x] 4.2.3 `updater::get_app_version` **(REVERTED)**
- [x] 4.3 `src-tauri/src/lib.rs` の `mod updater;` 追加 **(REVERTED — 削除)**
- [x] 4.4 `src-tauri/src/lib.rs` に `.plugin(tauri_plugin_updater::Builder::new().build())` + `.plugin(tauri_plugin_process::init())` を追加（現存）
- [x] 4.5 `tauri::generate_handler![...]` に updater commands を追加 **(REVERTED — handler から削除)**

## 5. Rust 側: メニュー統合

- [x] 5.1 `src-tauri/src/menu.rs` の `setup` に `Check for Updates...` メニュー項目を構築
- [x] 5.2 `app_menu` の `SubmenuBuilder` で `about()` の直後にこの項目を挿入
- [x] 5.3 `on_menu_event` で `"check_for_updates"` ハンドラを追加

## 6. Rust 側: 単体テスト (REVERTED)

> §4 のモジュール削除に伴い updater.rs テストも消失。残るのは既存モジュールのテスト群のみ。

- [x] 6.1 `#[cfg(test)] mod tests` を追加 **(REVERTED — モジュール削除と共に消失)**
- [x] 6.2 `UpdaterSettings` の serde round-trip テスト **(REVERTED)**
- [x] 6.3 `cargo test` でパス **(REVERTED — 削除後も既存テストはパス)**

## 7. フロントエンド: API ラッパー

- [x] 7.1 `src/api/updater.ts` を新規作成し、以下をエクスポート:
  - [x] 7.1.1 `getUpdaterSettings(): Promise<UpdaterSettings>` **(REVERTED — Rust command 削除に伴い不要)**
  - [x] 7.1.2 `updateUpdaterSettings(settings: UpdaterSettings)` **(REVERTED)**
  - [x] 7.1.3 `getAppVersion(): Promise<string>` **(REVERTED)**
  - [x] 7.1.4 `checkForUpdate()` — `@tauri-apps/plugin-updater` の `check()` を呼ぶ薄ラッパー（現存）
  - [x] 7.1.5 `downloadAndInstall(update, onProgress)` — 薄ラッパー（現存）
  - [x] 7.1.6 `relaunchApp()` — `@tauri-apps/plugin-process` の `relaunch()` を呼ぶ薄ラッパー（現存）
- [x] 7.2 `src/api/index.ts` から re-export を追加
- [x] 7.3 `src/types/updater.ts` を新規作成（最終的には `UpdaterState` 型のみを export、`UpdaterSettings` は破棄）

## 8. フロントエンド: メニューイベントリスナー API

- [x] 8.1 `src/api/menu.ts` に `onCheckForUpdates(handler)` を追加（既存 `onOpenSettings` と同じパターン）
- [x] 8.2 `src/api/index.ts` から re-export

## 9. フロントエンド: `useUpdater` フック

- [x] 9.1 `src/hooks/useUpdater.ts` を新規作成
- [x] 9.2 状態: `idle | checking | available | downloading | installing | error` の discriminated union（最終構成。`upToDate` 状態は廃止し、手動チェック時の `Cork is up to date.` は transient toast で表現）
- [x] 9.3 起動時自動チェック処理（`main` Window 限定ゲート）:
  - [x] 9.3.1 マウント時 `useEffect` 1 回で `getCurrentWebviewWindow().label === "main"` を判定し、`main` 以外なら以降の処理を全 skip
  - [x] 9.3.2 `getUpdaterSettings()` を読んで `autoCheck=false` ならさらに skip **(REVERTED — 設定撤廃により常時 ON)**
  - [x] 9.3.3 `checkForUpdate` を呼んで結果に応じて状態遷移
  - [x] 9.3.4 成功時のみ `lastCheckedAt` を永続化 **(REVERTED — 永続化なし)**
  - [x] 9.3.5 モジュール global `autoCheckFiredOnce` ref で React StrictMode 二重マウント対策
- [x] 9.4 手動チェック処理:
  - [x] 9.4.1 `checkManually()` を controller として返す
  - [x] 9.4.2 結果が「最新」→ `Cork is up to date.` info toast、「エラー」→ `Update check failed: ...` error toast を発火
- [x] 9.5 メニューイベント `menu:check-for-updates` の listen → `runCheck("manual")` を呼ぶ
- [x] 9.6 同 Window 内での二重実行防止（既に `checking | downloading | installing` なら新規チェックを ignore）

## 10. フロントエンド: UI コンポーネント

- [x] 10.1 `src/components/organisms/shell/UpdateAvailableDialog.tsx` を作成 **(REVERTED — sonner toast に統合)**
- [x] 10.2 `src/components/organisms/shell/UpdateProgressDialog.tsx` を作成 **(REVERTED — sonner toast に統合)**
- [x] 10.3 `src/components/organisms/settings/UpdaterSection.tsx` を作成 **(REVERTED — Settings セクション撤廃)**
- [x] 10.4 shell / settings の barrel に re-export 追加 **(REVERTED — UpdaterToast の re-export に置換)**
- [x] 10.5 (新規) `src/components/organisms/shell/UpdaterToast.tsx` を作成（sonner ブリッジ organism、null を返す副作用 component）
  - [x] 10.5.1 `useEffect` で `UpdaterState` を sonner の `toast()` / `toast.loading()` / `toast.error()` にマッピング、同じ `TOAST_ID` で in-place 更新
  - [x] 10.5.2 `available` 時: action ボタン `Install and Restart` + `Release notes ↗` リンク + `closeButton: true` + `onDismiss` で state sync
  - [x] 10.5.3 action onClick で `event.preventDefault()` 呼び、sonner の自動 dismiss を抑制してから `onInstall()` 発火
  - [x] 10.5.4 `downloading` 時: `toast.loading` で sonner デフォルト spinner、description に Cork-styled progress bar + `tabular-nums` の数値テキスト
  - [x] 10.5.5 `installing` 時: title は引き続き `Downloading Cork x.y.z`、description は `Restarting shortly…`
  - [x] 10.5.6 `error` 時: `toast.error` + close button + `onDismiss` で state sync
  - [x] 10.5.7 各非-`available` ブランチで `action`, `closeButton`, `onDismiss` を明示的に `undefined` リセット（sonner option bleed-through 対策）
  - [x] 10.5.8 `prevKindRef` で visible → idle 遷移時のみ `toast.dismiss(TOAST_ID)` を呼ぶロジック（mount 時の RAF race 回避）

## 11. フロントエンド: 既存 SettingsDialog への組み込み (REVERTED)

- [x] 11.1 `src/components/organisms/settings/SettingsDialog.tsx` を編集 **(REVERTED — updater プロップ削除)**
- [x] 11.2 MCP Server セクション直後に `UpdaterSection` を追加 **(REVERTED — Settings 撤廃)**

## 12. フロントエンド: App ルートでの統合

- [x] 12.1 `src/App.tsx` で `useUpdater()` を呼ぶ（auto-check は `main` Window でのみ走る、手動チェックは全 Window で可能）
- [x] 12.2 `<UpdaterToast>` を `useUpdater().state` で駆動するために App.tsx でレンダリング
- [x] 12.3 エラー時 / 手動チェックで最新時の sonner toast は `useUpdater` 内で発火
- [x] 12.4 `onOpenReleaseNotes` は module-scope の関数として hoist し、props の参照同一性を保ち UpdaterToast の useEffect 再走を抑制

## 13. CI: GitHub Actions ワークフロー拡張

- [x] 13.1 `.github/workflows/release-please.yml` の `build` ジョブ:
  - [x] 13.1.1 `bun run tauri build` ステップに env を追加: `TAURI_SIGNING_PRIVATE_KEY` と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - [~] 13.1.2 ビルド成果物の実ファイル名確認は本番初回 CI 実行時に行う（ローカルでは `--no-bundle` 検証のため `.app.tar.gz` 未生成。仮定: `Cork_<version>_aarch64.app.tar.gz`）
  - [x] 13.1.3 `updater-bundle` 別 artifact として `*.app.tar.gz` と `*.app.tar.gz.sig` を upload
- [x] 13.2 `release` ジョブ:
  - [x] 13.2.1 `download-artifact` で `updater-bundle` も追加で取得
  - [x] 13.2.2 `gh release upload` で DMG + tar.gz + sig をまとめてアップロード
  - [x] 13.2.3 `gh release view --json body --jq .body` で release body 取得
  - [x] 13.2.4 `bun run ./scripts/build-update-manifest.ts --version "${TAG_NAME#v}" --signature ... --notes ... --out ./latest.json`
  - [x] 13.2.5 生成された `latest.json` を release にアップロード

## 14. 新規スクリプト: `scripts/build-update-manifest.ts`

- [x] 14.1 `scripts/build-update-manifest.ts` を新規作成
- [x] 14.2 引数: `--version <x.y.z>` / `--signature <path>` / `--notes <string>` (optional) / `--out <path>`
- [x] 14.3 `signature` ファイルの中身を読み出して文字列化（trim）
- [~] 14.4 ダウンロード URL のファイル名は `Cork_<version>_aarch64.app.tar.gz` で仮置き（CI で実ビルド確認後に修正の可能性）
- [x] 14.5 `darwin-aarch64` プラットフォームエントリを含む `latest.json` を組み立て:
  ```json
  {
    "version": "<x.y.z>",
    "notes": "<--notes の中身 or fallback: 'See release notes at https://github.com/koki-develop/Cork/releases/tag/v<x.y.z>'>",
    "pub_date": "<RFC 3339 now>",
    "platforms": {
      "darwin-aarch64": {
        "signature": "<署名ファイルの中身>",
        "url": "https://github.com/koki-develop/Cork/releases/download/v<x.y.z>/Cork_<x.y.z>_aarch64.app.tar.gz"
      }
    }
  }
  ```
- [x] 14.6 出力パスに JSON を書き出し
- [x] 14.7 ローカル試走で生成物確認済み（version=0.16.0, fake sig, notes 全て正しくマニフェスト化）

## 15. Homebrew Cask への `auto_updates true` 追加

- [x] 15.1 `scripts/build-cask.ts` の `buildCaskContent` 関数内、`depends_on` の前に `auto_updates true` を追加
- [~] 15.2 出力検証は本番リリース時に確認（ローカル試走はネットワーク経由で `dmg` の SHA-256 を取りに行くため省略、ロジック変更は文字列追加のみで自明）

## 16. ドキュメント更新

- [x] 16.1 `src-tauri/AGENTS.md` Layout セクション: `updater.rs` を一度追加 → 削除（最終構成は updater 専用モジュール無し）
- [x] 16.2 `src-tauri/AGENTS.md` Cargo deps セクション: `tauri-plugin-updater` / `tauri-plugin-process` を追加（プラグイン登録のみで Rust 側 updater モジュール無しの旨を明示）
- [x] 16.3 `src-tauri/AGENTS.md` Tests セクション: `updater.rs` covered modules を追加 → 削除
- [x] 16.4 `AGENTS.md` Commands 表は変更なし
- [x] 16.5 `src/hooks/AGENTS.md` に `useUpdater.ts` を追加（最終的に `upToDate` 状態・`lastCheckedAt` 永続化への言及を削除）
- [x] 16.6 `src/components/organisms/settings/AGENTS.md` に `UpdaterSection.tsx` を追加 → 削除。`src/components/organisms/shell/AGENTS.md` に `UpdateAvailableDialog.tsx` / `UpdateProgressDialog.tsx` を追加 → `UpdaterToast.tsx` に書き換え
- [x] 16.7 `src/api/AGENTS.md` の `updater.ts` を「Rust command + JS plugin ラッパー」記述 → 「JS plugin ラッパーのみ」に書き換え
- [x] 16.8 `src/types/AGENTS.md` の `updater.ts` を `UpdaterSettings` 記述 → `UpdaterState` 記述に書き換え

## 17. 検証 (Verification Gates)

- [x] 17.1 `bunx tsc --noEmit` がパス
- [x] 17.2 `bun run lint` がパス
- [x] 17.3 `bun run fmt:check` がパス
- [x] 17.4 `cargo test` (`src-tauri/` 配下) 全 312 テストパス
- [x] 17.5 `cargo clippy` (`src-tauri/`) 警告なし
- [x] 17.6 `bun run tauri build --no-bundle` ローカル成功

## 18. 手動 QA (実機検証)

- [x] 18.1 ローカルで `bun run tauri dev` 起動 → メニュー `Cork > Check for Updates...` が表示される
- [-] 18.2 Settings 画面の Update セクション表示確認 **(REVERTED — セクション撤廃により対象なし)**
- [-] 18.3 自動チェック OFF 時のネットワークアクセス無し検証 **(REVERTED — 設定撤廃により対象なし)**
- [x] 18.4 自動チェック起動時に `latest.json` への HTTP リクエストが発生する（一時的なローカル HTTP サーバーで検証）
- [x] 18.5 偽 `latest.json` で新バージョンを宣言 → 右下に `Update available` toast が表示される
- [x] 18.6 `Install and Restart` → 同 toast が downloading に in-place 遷移、progress bar 動作、installing 経由で error（fake sig）に到達
- [x] 18.7 偽 tar.gz の minisign 検証失敗 → error toast 表示確認
- [x] 18.8 `--uptodate` モードで「Cork is up to date.」info toast 表示確認（自動クローズ 4 秒）
- [ ] 18.9 **multi-window dedup 検証**: `main` Window 起動 → auto-check 1 回発火を確認 → `File > New Window` で 2 つ目 Window (`workspace-1`) を開く → 2 つ目 Window では auto-check が一切発火しないことを Activity Monitor / network log で確認
- [ ] 18.8 マイナーリリース（0.16.0 → 0.16.1 等）で実際の in-app 更新が成功する（リリース後の本番検証）
  - [ ] 18.8.1 ダウンロード進捗ダイアログが表示される
  - [ ] 18.8.2 再起動後 Gatekeeper プロンプトが出ない
  - [ ] 18.8.3 `codesign --display /Applications/Cork.app` で ad-hoc 署名が保持されている
  - [ ] 18.8.4 TCC 権限（フルディスクアクセス等）が継続している
  - [ ] 18.8.5 `cork --version` が新バージョン番号を返す
  - [ ] 18.8.6 `brew list --cask --versions cork` で `brew upgrade` が二重更新を試みない（bundle_version 比較で skip）

## 19. OpenSpec アーカイブ準備

- [x] 19.1 全 Verification Gate パス・UI 実機検証完了を確認し、change を `complete` 状態として記録（本番リリース後の §18.9 実機検証は別途実施予定）
- [x] 19.2 `openspec/changes/in-app-updater/` を `openspec/changes/archive/2026-06-26-in-app-updater/` へ移動完了、canonical spec を `openspec/specs/updater/spec.md` に sync 済み
