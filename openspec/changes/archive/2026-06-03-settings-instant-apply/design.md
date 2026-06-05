## Context

Cork の設定パネル (`SettingsPanel.tsx`) は、直前に投入した `unify-settings-save-behavior` 変更によって Workspace Directory / Statuses のどちらも `Save` ボタンで確定する pending-state ベースの編集モデルになっている。実際に触ってみると毎回の操作で `Save` を押す必要があり、特に「フォルダを開く → ピックする → さらに `Save` を押す」「ステータスを 1 個消すだけで `Save` を押す」というフローは煩雑である。pending 状態を管理するために `SettingsPanel` 側に `pendingDir`、`useStatusEdit` 側に `isDirty` / `dragSnapshot` / `handleSave` が混在しており、コードも素直ではない。

一方、ボード上の操作（カードの移動、列の並び替え）はすべて即時永続化されている。設定パネルも同じセマンティクスに揃えれば、ユーザーは「クリック / 入力 = 反映」という単一のメンタルモデルだけで操作でき、コードも `Cancel` / `Save` バリアを取り払って素直に書ける。

## Goals / Non-Goals

**Goals:**

- 設定パネル内の全操作を Save ボタンを介さず即時永続化する
- ユーザーが「いつ反映されるか」を意識せずに済むよう、タイミングを操作種別ごとに固定する（クリック直後 / DnD ドロップ直後 / フォーカスアウト時）
- pending 状態を管理するコード（state / インジケータ / Cancel-discard ロジック）を全て削除し、`SettingsPanel` を「即時反映の薄いビュー」にする
- 入力途中のラベルを 1 文字ごとに永続化することは避け、書き換えが落ち着いた `onBlur` まで待つ

**Non-Goals:**

- Tauri バックエンドの `pick_directory` / `set_workspace_directory` / `save_statuses` の API 変更（前の change で分離済みなのでそのまま流用）
- ボード側の挙動変更
- 永続化失敗時のリトライ UI（既存と同様 `console.error` でロギングし、状態は復元しない方針を踏襲）
- Undo / Redo 機能の導入

## Decisions

### Decision 1: タイミングを操作種別ごとに固定する

| 操作                         | 永続化トリガー                                          | 理由                                                                     |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Workspace directory のピック | `pick_directory` が path を返した直後                   | ユーザーが明示的にフォルダを「選んだ」瞬間が確定意図                     |
| Status の削除                | ゴミ箱クリック直後                                      | 削除は破壊的だが UI 上「ボタンを押した = 確定」が直感的                  |
| Status の並び替え            | `onDragEnd` の `canceled` でないとき                    | DnD のドロップ完了が確定意図。途中の `onDragOver` では永続化しない       |
| Status の追加                | 行追加直後ではなく、その行から **フォーカスが外れた時** | 追加直後は空ラベル、ユーザーは続けて打鍵するので途中保存しても意味がない |
| Status のラベル編集          | `<input>` の `onBlur` 時                                | 1 文字ごとの保存は無駄が多く、フォーカスアウトが「編集確定」として自然   |

**検討した代替案:**

- _全部 `onChange` で即時保存_: ステータスラベルは打鍵ごとに `save_statuses` が走り、ストアへの書き込みが多発する。ユーザー体験的にも「タイポ途中の状態が永続化される」のは違和感がある → 却下
- _デバウンス（300ms など）_: タイマー管理が増え、フォーカスアウト時に未保存のまま閉じるエッジケースが残る → 却下。`onBlur` で十分

### Decision 2: 空ラベル行はフォーカスアウト時に除外する

`Add Status` ボタンを押すと空文字の行が追加される。`onBlur` で `label.trim() === ""` だった場合、`save_statuses` は呼ばずローカル state からその行を取り除く。

**理由:** 空ラベルは意味のあるステータスではないため永続化対象外。「追加ボタンを誤って押した」「途中でやめた」ケースをユーザーが手動で消す必要がなくなる。

**代替案として検討した:** 空行も含めて永続化し、バックエンド側でフィルタする → ストアに空ステータスが残り `list_tasks` のデフォルトステータス推定 (`lib.rs:108-117`) が壊れる可能性があるため却下。

### Decision 3: 重複ラベルは onBlur 時に検出する

`onBlur` で永続化を試みる際に、`label.trim().toLowerCase()` ベースで他の行と重複していたら `save_statuses` をスキップし、エラーメッセージを表示してフォーカスを当該 input に戻す。ユーザーがラベルを直して再び `onBlur` したら再試行される。

**理由:** これまでも `useStatusEdit.handleSave` で同等の検証を行っていた。即時反映に移っても重複は不正な状態なので同じ検証を行う必要がある。

**ローカル state の扱い:** 重複検出時もローカル state の `label` は書き戻さない（ユーザーの入力をそのまま残す）。永続化されていないだけ。

### Decision 4: Esc / 背景クリックは「閉じるだけ」に降格

これまで `discardAndClose` は pending 変更を破棄してから閉じる必要があったが、もう保存されていない変更が存在しないので、単に `onClose()` を呼ぶだけでよい。`SettingsPanel` の `key={String(settingsOpen)}` による強制再マウントは継続するので、次回開いた時はクリーンな state でレンダーされる。

### Decision 5: `useStatusEdit` の API を作り直す

旧 API は `handleSave` を中心に組み立てられているが、即時反映では `handleSave` は呼び出し場所がなくなる。新 API:

```ts
useStatusEdit(initialStatuses, {
  onStatusesChange: () => void   // 永続化成功後に親に通知
})
  → {
    editing: EditingEntry[],
    error: string | null,
    pendingFocusId: string | null,    // 重複エラー時にフォーカスを戻す対象
    handleLabelChange: (index, label) => void,        // ローカル state のみ
    handleLabelBlur:   (index) => Promise<void>,      // トリム / 空行除外 / 重複検証 / 永続化
    handleAdd:         () => void,                    // ローカル state のみ
    handleRemove:      (index) => Promise<void>,      // 永続化
    handleDragStart, handleDragOver,                  // 既存のまま
    handleDragEnd:     (event) => Promise<void>,      // canceled でなければ永続化
  }
```

`onStatusesChange` を渡す形にすることで、`SettingsPanel` 側は「永続化が起きたら親に通知」というだけのフックの戻り値を素直に流せばよい。

**代替案として検討した:** 永続化を `SettingsPanel` 側で書く → `useStatusEdit` は薄くなるが、検証・トリム・空行除外・エラー state など状態に紐づくロジックがコンポーネントに漏れる。フックに閉じ込めた方が責務が綺麗 → 棄却。

### Decision 6: Workspace directory 即時反映の責務分担

`handleChangeDirectory` 内で `pick_directory` → `set_workspace_directory` → `onDirectoryChange(path)` を順に呼ぶ。`set_workspace_directory` の呼び出し失敗時は `console.error` で吐き出して終了（state も親も更新しない）。`onClose` は呼ばない（ユーザーが「次に statuses も触りたい」と思うかもしれない）。

## Risks / Trade-offs

- **[誤クリックでステータス削除 → 復元不能]** → Mitigation: 削除はゴミ箱アイコンクリック後の確認なしで即時行う既存挙動だが、Cork の対象はラベル文字列のみで `list_tasks` のステータスは frontmatter から読まれるためタスク自身は失われない。`Add Status` で同名を打ち直せばラベル復元できる。確認ダイアログは UX を損なうので追加しない
- **[onBlur のレースコンディション]** → Mitigation: ラベル入力中にゴミ箱で他の行を削除すると、即時 `save_statuses` と編集中の `onBlur` 永続化が同時に走る可能性がある。永続化は `await` で順序を保ち、`save_statuses` は常に「現在の `editing` をベースにした完全な配列」を送るので最後勝ち。許容範囲
- **[空行除外と Add Status の連打]** → Mitigation: 連打して空行を量産しても、フォーカスを動かさない限り `editing` に積まれるだけ。フォーカスを当てに行った瞬間に過去の空行は `onBlur` 経由で消えていく。挙動として奇異だが致命的ではない
- **[`set_workspace_directory` 失敗時に UI が不整合]** → Mitigation: `setDir` を呼ばないので Board は古いディレクトリのまま動き続ける。エラーは console に流す。今後 toast 実装を入れたらフィードバック追加
- **[Statuses 永続化失敗時の state 復元なし]** → Mitigation: 既存 `useStatusEdit.handleSave` も成功前提でローカル state を進めていたため挙動継続。失敗ケースは現状の Cork の運用上ほぼ起きない（ローカル `tauri_plugin_store` への書き込み失敗のみ）
