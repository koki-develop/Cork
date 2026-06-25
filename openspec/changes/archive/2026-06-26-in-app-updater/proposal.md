## Why

現状 Cork のバージョン更新はユーザー任せ — DMG を再ダウンロードして手で差し替えるか、Homebrew Cask 利用者なら `brew upgrade --cask cork` を明示実行するかの二択しか提供できていない。アプリ起動中に新バージョンの存在を知る手段が一切なく、リリース告知 → 更新までの導線が極端に長い。配布手段は二系統あるが Apple Developer Program に加入しない方針のため、Sparkle や Apple 公式 Updater のような Developer ID 前提の解決策は採れず、「ad-hoc 署名のままで成立する自走更新」を独自に設計する必要がある。

## What Changes

- **Tauri v2 公式 `tauri-plugin-updater` を採用**して、アプリ起動時の自動チェック・手動チェック・ダウンロード・インストール・再起動の一連の自走更新フローを提供する
- **minisign による独立署名 + ビルド時 ad-hoc codesign の二段構え**を導入。Apple Developer ID を取得せずに、アップデート tar.gz の真正性検証（minisign）と macOS 起動要件（ad-hoc codesign）の双方を満たす
- **GitHub Releases に静的 `latest.json` を配置**し、`tauri-plugin-updater` の endpoint として使う。`latest.json` の生成と署名は CI が担う
- **`Cork > Check for Updates...` メニュー項目**を追加する
- **更新通知は sonner toast**として右下に表示する（中央 modal ではなく、ユーザー作業を妨げないスタイル）。state machine を sonner の同 id update セマンティクスにブリッジし、`available → downloading → installing → (success or error)` を **同じ toast カード内で in-place 遷移**させる。自動クローズ無し、× で手動クローズ
- **`Update available` toast には `Install and Restart` action ボタン + `Release notes ↗` リンク + 閉じる X**。リリースノート本文は UI には表示せず、リンクから GitHub Release ページを開く
- **Homebrew Cask に `auto_updates true` を追加**。`scripts/build-cask.ts` を更新し、`brew upgrade --cask cork`（名前指定）は従来通り、bare `brew upgrade` は Brew 側の bundle-version 比較で二重更新を避ける挙動に揃える
- **CI（`.github/workflows/release-please.yml`）の `build`/`release` ジョブを拡張**。`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を Secret として読み込み、`Cork.app.tar.gz` + `Cork.app.tar.gz.sig` を upload、`scripts/build-update-manifest.ts`（新規）が `latest.json` を生成して release にアップロード
- **`tauri.conf.json` に `bundle.macOS.signingIdentity: "-"` と `bundle.createUpdaterArtifacts: true` と `plugins.updater.{endpoints, pubkey}` を追加**
- **`capabilities/default.json` に `updater:default` と `process:default` を追加**（updater の check/install と Tauri runtime restart のため）

### 設計の変更履歴（実装中に決定）

初稿では Settings 画面に「自動チェック ON/OFF トグル + 最終チェック時刻 + Check Now ボタン」の Update セクションを追加する案だったが、実装直前に **「常に自動チェック、ユーザー制御不要」「中央 modal ではなく通知 toast」** の方針へ転換した。これに伴い以下を本 change から除外：

- Settings 画面の Update セクション (`UpdaterSection.tsx`) → 設置しない
- 永続化設定 `updater.{autoCheck, lastCheckedAt}` → 保存しない（`tauri-plugin-store` には触れない）
- Rust 側 `updater.rs` モジュール → 不要、削除
- `get_updater_settings` / `update_updater_settings` / `get_app_version` Tauri command → 不要、削除
- `UpdaterSettings` 型 → `UpdaterState` (state machine) の型のみが `@/types/updater.ts` に残る

## Capabilities

### New Capabilities

- `updater`: アプリ自走更新の機能全体。自動／手動チェック・ダウンロード・インストール・再起動・通知 UI（メニュー・toast）の要件を含む

### Modified Capabilities

（なし — 既存の canonical spec は変更しない。`updater` は完全に新規の capability として導入する）

## Impact

**Code（新規）**

- `src/api/updater.ts` — `@tauri-apps/plugin-updater` (`checkForUpdate` / `downloadAndInstall`) と `@tauri-apps/plugin-process` (`relaunchApp`) の薄ラッパー。Rust コマンドのラッパーは含まない（Rust 側 updater モジュールが存在しないため）
- `src/hooks/useUpdater.ts` — 状態遷移（idle / checking / available / downloading / installing / error）+ 起動時自動チェック（`main` Window 限定ゲート）+ menu イベント listen + dev-only delay 機構
- `src/types/updater.ts` — `UpdaterState` 型（discriminated union）。`@/hooks` への直接 import を禁ずる oxlint ルールを回避するため `@/types` 側に置く
- `src/components/organisms/shell/UpdaterToast.tsx` — `useUpdater` の state を sonner toast に橋渡しする organism。null を返す（UI は sonner の `<Toaster>` スタックで描画）。state 遷移ごとに同じ id で `toast(...)` / `toast.loading(...)` / `toast.error(...)` を呼んで in-place 更新
- `scripts/build-update-manifest.ts` — `latest.json` 生成スクリプト（release body から CHANGELOG エントリを読み込んで `notes` に埋め込む）

**Code（変更）**

- `src-tauri/Cargo.toml` — `tauri-plugin-updater` と `tauri-plugin-process` 追加
- `package.json` — `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` 追加
- `src-tauri/src/lib.rs` — プラグイン登録のみ追加（updater 専用の `#[tauri::command]` は無いので `invoke_handler` は無変更）
- `src-tauri/src/menu.rs` — `app_menu` に `Check for Updates...` を `about()` 直後に挿入、メニューイベントで focused window に `menu:check-for-updates` を emit
- `src-tauri/tauri.conf.json` — `bundle.createUpdaterArtifacts` / `bundle.macOS.signingIdentity` / `plugins.updater.*` を追加
- `src-tauri/capabilities/default.json` — `updater:default` + `process:default`
- `src/App.tsx` — `useUpdater()` 呼び出し + `<UpdaterToast>` レンダリング（module-scope の `openReleaseNotes` ヘルパで参照同一性を保つ）
- `src/api/menu.ts` + `src/api/index.ts` — `onCheckForUpdates` listener 追加 + 公開
- `scripts/build-cask.ts` — Cask 文字列に `auto_updates true` 追加
- `.github/workflows/release-please.yml` — Secret 経由の env vars、updater 成果物 upload、`latest.json` 生成ステップ追加
- `AGENTS.md` / `src-tauri/AGENTS.md` / `src/api/AGENTS.md` / `src/hooks/AGENTS.md` / `src/components/organisms/shell/AGENTS.md` / `src/types/AGENTS.md` — モジュール一覧と CI 説明を更新

**Dependencies**

- 追加: `tauri-plugin-updater` + `tauri-plugin-process` (Rust), `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` (npm)

**Infrastructure**

- GitHub repo の Secrets に `TAURI_SIGNING_PRIVATE_KEY` と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を登録（minisign 鍵ペア生成はメンテナがローカルで行う）
- `koki-develop/homebrew-tap` の `Casks/cork.rb` が次リリースで `auto_updates true` を含む形に置き換わる（自動）

**Distribution**

- 既存配布ルート（DMG 直ダウンロード / Brew Cask）は維持。新たに「自走更新」が両方の経路で動作する
- minisign 公開鍵は `tauri.conf.json` にハードコードされ、初回リリース以降の鍵ローテーションは大規模オペレーション（既存ユーザー全員に旧鍵→新鍵の橋渡し版を配信する必要がある）になる点を `design.md` で明示

**範囲外**

- Windows / Linux の updater 設定（プロジェクトが macOS only）
- delta update / 差分更新
- ロールバック機能
- 自動チェックの ON/OFF 制御（常に有効、ユーザー側に opt-out を提供しない）
- 永続化設定 (`updater.autoCheck`, `updater.lastCheckedAt`) — 不要のため `tauri-plugin-store` に触れない
- 現状の Cask preflight 相当の `--identifier` / `designated requirement` カスタム再署名のビルド時統合（初回リリース後の TCC 挙動次第で別 change として検討）
