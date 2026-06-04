# per-workspace-statuses Specification (Delta)

## MODIFIED Requirements

### Requirement: frontmatter に `status` を持たない `.md` ファイルは `list_tasks` に含めない

frontmatter に `status` キーを持たない `.md` ファイルは Cork の管理対象外とみなし、`list_tasks` の結果に含めてはならない (MUST NOT)。従来の「`.cork.json` の先頭ステータスをデフォルトとして割り当てる」挙動は廃止される。

frontmatter に `status` キーが存在するが、その値が `.cork.json` に定義されたいずれのステータスラベルとも一致しない場合は、タスクはその値を持ったまま `list_tasks` の結果に含めなければならず (MUST)、board 上では Unknown レーン（別途定義）に表示される。

#### Scenario: `status:` なしのファイルが除外される

- **GIVEN** 作業ディレクトリに `---\ntitle: Hello\n---\n` という内容の `hello.md` が存在する（frontmatter はあるが `status:` キーがない）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `hello.md` に対応する要素は含まれない

#### Scenario: frontmatter 自体がないファイルが除外される

- **GIVEN** 作業ディレクトリに frontmatter を持たない `readme.md` が存在する
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `readme.md` に対応する要素は含まれない

#### Scenario: 未定義ステータス値を持つタスクは結果に含まれる

- **GIVEN** `.cork.json` の statuses が `[{"label": "Todo"}, {"label": "Done"}]`
- **AND** 作業ディレクトリに `---\nstatus: Doing\n---\n` の `task.md`（`Doing` は定義済みステータスに存在しない）
- **WHEN** フロントエンドが `list_tasks` を invoke する
- **THEN** 戻り値の配列に `task.md` に対応する要素が含まれる
- **AND** その要素の `status` は `"Doing"` である
