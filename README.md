<h1 align="center">Cork</h1>

<p align="center">
<img src="./src-tauri/icons/icon.png" alt="Cork Logo" width="200">
</p>

<p align="center">
<i>Kanban board for local Markdown files.</i>
</p>

<p align='center'>
<a href="https://github.com/koki-develop/Cork/releases/latest"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/koki-develop/Cork?style=flat"></a>
<a href="./LICENSE"><img src="https://img.shields.io/github/license/koki-develop/Cork?style=flat" /></a>
<a href="https://github.com/koki-develop/Cork/actions/workflows/ci.yml"><img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/koki-develop/Cork/ci.yml?branch=main&logo=github&style=flat" /></a>
<img alt="macOS" src="https://img.shields.io/badge/platform-macOS-blue?style=flat" />
</p>

<p align="center">
<img src="./screenshots/board.png" alt="Board" width="680">
<img src="./screenshots/task.png" alt="Task" width="680">
<img src="./screenshots/settings.png" alt="Settings" width="680">
</p>

## Installation

```
brew install --cask koki-develop/tap/cork
```

## How it works

Cork has no database. A workspace is just a folder, and every task is a plain Markdown file inside it — so your board lives entirely in version-controllable, editor-friendly text.

- **One task = one `.md` file.** The file name is the task title; the Markdown body is the task description.
- **Frontmatter holds the metadata.** `status`, `tags`, and `date` live in the YAML frontmatter at the top of each file.

```markdown
---
status: In Progress
tags:
  - feature
  - urgent
date: 2026-06-12
---

Write the project README, including a "How it works" section.
```

Because it's all just files, you can edit tasks in any editor, grep them, and track the whole board in Git.

## CLI

Installing via Homebrew also puts a `cork` command on your `PATH`.

```sh
# Open a new window.
cork

# Open a directory as a workspace.
cork ./path/to/workspace
```

## License

[MIT](./LICENSE)
