# Changelog

## [0.17.3](https://github.com/koki-develop/Cork/compare/v0.17.2...v0.17.3) (2026-06-30)


### Bug Fixes

* **editor:** preserve blank lines and fence width in fenced code blocks ([d517bff](https://github.com/koki-develop/Cork/commit/d517bff1bf388b45785ea9acd45519776d8ae44f))

## [0.17.2](https://github.com/koki-develop/Cork/compare/v0.17.1...v0.17.2) (2026-06-28)


### Bug Fixes

* **editor:** align shouldPreserveNewLines between import and export ([c68dada](https://github.com/koki-develop/Cork/commit/c68dadadc7e825dedfe54068b80ccb2c44151f1b))
* **editor:** show floating toolbar on whitespace-only text selection ([9a18419](https://github.com/koki-develop/Cork/commit/9a184197a1b13bd1869dc014381a3da4d9912bb2))
* preserve leading blank lines in task body through save/load round-trip ([8609842](https://github.com/koki-develop/Cork/commit/86098421209264f100da1293707b3e67fec1784c))
* restore macOS traffic-light offset after AppKit relayouts ([eb9ec95](https://github.com/koki-develop/Cork/commit/eb9ec95348ddbc3ca24427c7f9d59b2508520452))

## [0.17.1](https://github.com/koki-develop/Cork/compare/v0.17.0...v0.17.1) (2026-06-27)


### Bug Fixes

* **editor:** match bare `>` blank line so blockquote round-trips cleanly ([2d22256](https://github.com/koki-develop/Cork/commit/2d22256d58e117605de797ecd6cb4a6b65931257))

## [0.17.0](https://github.com/koki-develop/Cork/compare/v0.16.4...v0.17.0) (2026-06-27)


### Features

* **test:** add MarkdownEditor heading-render specs for live typing and initial value ([6fc4f1f](https://github.com/koki-develop/Cork/commit/6fc4f1f92360483346d08b6f11d91b8a8cd3faca))
* **test:** add MarkdownEditor list-system plugin specs ([2dcf353](https://github.com/koki-develop/Cork/commit/2dcf353bc36fb8b808f04ed728462b4923df9b5b))
* **test:** add MarkdownEditor quote-block keyboard and typing-merge specs ([d19e8ad](https://github.com/koki-develop/Cork/commit/d19e8adcb8db03d32e699d8dbfebcbd8ab3a647b))
* **test:** introduce Vitest browser-mode test framework for the MarkdownEditor ([b98098f](https://github.com/koki-develop/Cork/commit/b98098f853fe41dd8c59e956b527c92ce7e91f9b))
* **ui:** support nested blockquotes in the task body editor ([4a1d3e0](https://github.com/koki-develop/Cork/commit/4a1d3e031e8f97f176ff3fff979ba87a95f7acd5))


### Bug Fixes

* **editor:** merge live-typed nested quote with adjacent QuoteNode sibling ([d89cf74](https://github.com/koki-develop/Cork/commit/d89cf7480ec880012e8c39fc35a93bd85c03432d))

## [0.16.4](https://github.com/koki-develop/Cork/compare/v0.16.3...v0.16.4) (2026-06-26)


### Bug Fixes

* **deps:** update dependency @tauri-apps/api to v2.11.1 ([#42](https://github.com/koki-develop/Cork/issues/42)) ([33d83f1](https://github.com/koki-develop/Cork/commit/33d83f18c8e34da77c6c5864d4e6413f62695bd0))

## [0.16.3](https://github.com/koki-develop/Cork/compare/v0.16.2...v0.16.3) (2026-06-26)


### Bug Fixes

* **updater:** match Tauri's default Cork.app.tar.gz filename in manifest URL ([#40](https://github.com/koki-develop/Cork/issues/40)) ([b42d192](https://github.com/koki-develop/Cork/commit/b42d19287feda27c6ea1552bd81979bc940ccce3))

## [0.16.2](https://github.com/koki-develop/Cork/compare/v0.16.1...v0.16.2) (2026-06-26)


### Bug Fixes

* **deps:** update react monorepo ([#18](https://github.com/koki-develop/Cork/issues/18)) ([d75d830](https://github.com/koki-develop/Cork/commit/d75d830211e87b885cea04a399fa0fe13c4cc62c))

## [0.16.1](https://github.com/koki-develop/Cork/compare/v0.16.0...v0.16.1) (2026-06-26)


### Bug Fixes

* **updater:** include app target so updater artifacts are produced ([#35](https://github.com/koki-develop/Cork/issues/35)) ([8cb65a0](https://github.com/koki-develop/Cork/commit/8cb65a0843c2c5654e5aa69834e5613ce8368d87))

## [0.16.0](https://github.com/koki-develop/Cork/compare/v0.15.0...v0.16.0) (2026-06-25)


### Features

* **updater:** add in-app updater via tauri-plugin-updater ([#33](https://github.com/koki-develop/Cork/issues/33)) ([c57fdba](https://github.com/koki-develop/Cork/commit/c57fdbad2f688c3c50ab343eb3ecef649a968710))

## [0.15.0](https://github.com/koki-develop/Cork/compare/v0.14.0...v0.15.0) (2026-06-24)


### Features

* **ui:** support GitHub-style task lists in the task body editor ([e1a2982](https://github.com/koki-develop/Cork/commit/e1a2982a14f464f84e8a1a1be1226132f6b65ac7))
* **ui:** syntax-highlight fenced code blocks in the task body editor ([3c6973e](https://github.com/koki-develop/Cork/commit/3c6973efe35bc52626e6abcb74f22ca326f3e640))


### Bug Fixes

* **ui:** ignore IME-confirm Enter when shifting focus from title to body ([6a147e0](https://github.com/koki-develop/Cork/commit/6a147e0fada291c2b0f6b22afc9d3f1a4793fe51))

## [0.14.0](https://github.com/koki-develop/Cork/compare/v0.13.1...v0.14.0) (2026-06-20)


### Features

* Enter in title focuses body editor in task dialogs ([84dcc03](https://github.com/koki-develop/Cork/commit/84dcc03bf8ce7e24f3f4d0d8a1b1da740b78c97b))
* **ui:** wrap selected text as a link when pasting a URL ([d7fbab5](https://github.com/koki-develop/Cork/commit/d7fbab53cba8fb53f33ff014cdb36adb5a2df3ef))

## [0.13.1](https://github.com/koki-develop/Cork/compare/v0.13.0...v0.13.1) (2026-06-20)


### Bug Fixes

* **ui:** preserve inline format on text re-wrapped with markdown markers ([2e3cece](https://github.com/koki-develop/Cork/commit/2e3cece93db242c8bb4469bbc962fe0929add593))

## [0.13.0](https://github.com/koki-develop/Cork/compare/v0.12.0...v0.13.0) (2026-06-20)


### Features

* **ui:** alias Ctrl+N / Ctrl+P to ArrowDown / ArrowUp in list navigation ([b51b37f](https://github.com/koki-develop/Cork/commit/b51b37ff47ec9416afa06f3677595e9e4164284a))


### Bug Fixes

* **ui:** empty the task body editor on select-all delete ([3e8b9a5](https://github.com/koki-develop/Cork/commit/3e8b9a50a3a549703dd1c7d45e1af5a67de3827c))
* **ui:** refine list-item editing in the task body editor ([#28](https://github.com/koki-develop/Cork/issues/28)) ([db27ab5](https://github.com/koki-develop/Cork/commit/db27ab55383604b046057542c20e79b1de1152f6))

## [0.12.0](https://github.com/koki-develop/Cork/compare/v0.11.0...v0.12.0) (2026-06-15)


### Features

* **mcp:** show per-tool setup snippets under the mcp.json block ([5ae8016](https://github.com/koki-develop/Cork/commit/5ae8016a7425870a5547545790b49ee0a8ac3b77))
* **ui:** add View &gt; Reload menu with Cmd+R shortcut ([cb2a3be](https://github.com/koki-develop/Cork/commit/cb2a3be93ecd5771c037b4e15d91b94762e09b6c))

## [0.11.0](https://github.com/koki-develop/Cork/compare/v0.10.0...v0.11.0) (2026-06-14)


### Features

* **mcp:** add update_task_title tool to rename tasks ([3dcb33b](https://github.com/koki-develop/Cork/commit/3dcb33bae1fe1306c13bcd6d352eeabd05408084))
* **ui:** add Markdown table support to the task body editor ([cfa40b1](https://github.com/koki-develop/Cork/commit/cfa40b1744e180b5267e72e974716b082988d141))
* **ui:** support horizontal rules in the task body editor ([a22a4c2](https://github.com/koki-develop/Cork/commit/a22a4c2ca344611c7a71f3664f77c974a21f5ad9))


### Bug Fixes

* **ui:** close dialog on first Escape when tag autocomplete is empty ([9ad3608](https://github.com/koki-develop/Cork/commit/9ad3608b368fbc296fb04072f7c5bd81a3c06d75))
* **ui:** keep modal dialogs clear of the header in short windows ([8ed0e98](https://github.com/koki-develop/Cork/commit/8ed0e982b4269c5d2c9113c71f5b23a64a6d92df))
* **ui:** reorder Task dialog fields for logical Tab navigation ([d963a71](https://github.com/koki-develop/Cork/commit/d963a7186be0c86354912cd711c49b8cdfa1d863))
* **ui:** restore Metadata-before-Body order in narrow task dialogs ([2bc7043](https://github.com/koki-develop/Cork/commit/2bc70432d247909faee736925b9c50259805ae8b))

## [0.10.0](https://github.com/koki-develop/Cork/compare/v0.9.0...v0.10.0) (2026-06-13)


### Features

* implement cork CLI to open and focus workspace windows ([bd357b8](https://github.com/koki-develop/Cork/commit/bd357b8ef14bcfd055d9f17b927e48285aa531ed))

## [0.9.0](https://github.com/koki-develop/Cork/compare/v0.8.0...v0.9.0) (2026-06-13)


### Features

* ship cork CLI inside the app bundle and link it onto PATH ([81ad0a7](https://github.com/koki-develop/Cork/commit/81ad0a7622af60eee6674ca366289c724899fd76))

## [0.8.0](https://github.com/koki-develop/Cork/compare/v0.7.0...v0.8.0) (2026-06-12)


### Features

* **ui:** autosave task body while typing instead of only on blur ([0226c6b](https://github.com/koki-develop/Cork/commit/0226c6b745c8611da829af8c3fa1c929a395c02d))


### Bug Fixes

* **ui:** restructure task dialogs with CSS Grid and single TagEditor instance ([cae15ee](https://github.com/koki-develop/Cork/commit/cae15ee7279d4e242d1134fd0697efff74a3bd84))

## [0.7.0](https://github.com/koki-develop/Cork/compare/v0.6.0...v0.7.0) (2026-06-12)


### Features

* allow task titles to contain slashes ([c8a9ffc](https://github.com/koki-develop/Cork/commit/c8a9ffc4be40946b73566ca88340e9f59cec8371))

## [0.6.0](https://github.com/koki-develop/Cork/compare/v0.5.1...v0.6.0) (2026-06-12)


### Features

* **ui:** add clear-formatting button to floating toolbar ([900dab0](https://github.com/koki-develop/Cork/commit/900dab0eca4e30561c37d389765d5c74cb24b39f))
* **ui:** auto-link bare URLs in task body editor ([b38f2dd](https://github.com/koki-develop/Cork/commit/b38f2dd7fc5bba989b403a824359c737179606ab))
* **ui:** distinguish code blocks and tame highlights in task body editor ([bb44a8a](https://github.com/koki-develop/Cork/commit/bb44a8afde9a72d2dfbb664150d0aefa4c57b684))
* **ui:** make task body editor links editable via hover panel ([78f9ec7](https://github.com/koki-develop/Cork/commit/78f9ec7d0862bb17d893c8b180e4af389da7d771))


### Bug Fixes

* clarify in MCP instructions that tasks are updated by editing files directly ([aa64d7b](https://github.com/koki-develop/Cork/commit/aa64d7be97c53448f3afdf393993054883f1a209))
* scope sample mcp.json to current window only ([37b85b6](https://github.com/koki-develop/Cork/commit/37b85b6a4ecaa92c38b1fa3412140316c63f7114))
* **ui:** make modal panel fully opaque and drop its backdrop blur ([e971c54](https://github.com/koki-develop/Cork/commit/e971c540ef9cd6462c872ade164cd04679656d04))
* **ui:** remove redundant "New Task" heading from create dialog ([cda1411](https://github.com/koki-develop/Cork/commit/cda1411c74c3278b8834e30c85bee735e232471d))

## [0.5.1](https://github.com/koki-develop/Cork/compare/v0.5.0...v0.5.1) (2026-06-12)


### Bug Fixes

* close calendar and tag autocomplete on dialog backdrop mousedown ([555915a](https://github.com/koki-develop/Cork/commit/555915aca376e3a27cc10b16633fa809b831e50f))

## [0.5.0](https://github.com/koki-develop/Cork/compare/v0.4.0...v0.5.0) (2026-06-12)


### Features

* add delete_task MCP tool with security guard ([8f4cc26](https://github.com/koki-develop/Cork/commit/8f4cc266eebca5a5635cb1a0cdaac98916645ae6))
* add task due dates ([1ac2d42](https://github.com/koki-develop/Cork/commit/1ac2d4213596ee2a83387f774acd9932b15af214))
* **ui:** add selection floating toolbar to task body editor ([bfcef57](https://github.com/koki-develop/Cork/commit/bfcef57d12048a38f1306291638ebfe2c91e8016))
* **ui:** improve task body editor links, lists, and code blocks ([e371957](https://github.com/koki-develop/Cork/commit/e3719574c69c8abbe3dd4bc7a3e6ba16ddf7a93c))
* **ui:** increase task dialog body default height to 20rem ([4101e33](https://github.com/koki-develop/Cork/commit/4101e3368ea83e2860f0abc9903e8b71c66f756e))
* **ui:** make task body a WYSIWYG Markdown editor (Lexical) ([05f7875](https://github.com/koki-develop/Cork/commit/05f7875f7c3df69b9674d738c340942341bf8c96))
* **ui:** make task create/detail dialogs 2-column ([bfdf27d](https://github.com/koki-develop/Cork/commit/bfdf27de2a9429c4b9f90c3b27425f7bf5d8ac73))
* **ui:** restyle task title and body fields as a borderless document ([ec2650b](https://github.com/koki-develop/Cork/commit/ec2650b2d86940543364f9b9280c3340536efbcf))
* **ui:** tighten create dialog body and drop its hover fill ([955be14](https://github.com/koki-develop/Cork/commit/955be14250de14f1564584791e1223b5fb214a9c))
* **ui:** tighten task dialog title layout and padding ([dbc9043](https://github.com/koki-develop/Cork/commit/dbc904350c0c440ceeefc3b6abed3fb4d257db64))


### Bug Fixes

* **deps:** pin dependencies ([#7](https://github.com/koki-develop/Cork/issues/7)) ([04a7b6a](https://github.com/koki-develop/Cork/commit/04a7b6aca9f6e22afc80df820d1ba56b9c169e6e))
* **ui:** confine task body inline formatting to non-code text ([86c1127](https://github.com/koki-develop/Cork/commit/86c1127aeb556122a05dd8de5a1a53427d5c0325))
* **ui:** keep task detail Status/Tags pinned to the top ([9f4ca8b](https://github.com/koki-develop/Cork/commit/9f4ca8b9e20f546f59361e35cb4949ee420e2083))
* **ui:** show format toolbar whenever the selection has formattable text ([9241421](https://github.com/koki-develop/Cork/commit/9241421da0e93167a567102415096b96b4c0615f))

## [0.4.0](https://github.com/koki-develop/Cork/compare/v0.3.0...v0.4.0) (2026-06-11)


### Features

* Add MCP server with list_tasks tool ([503fb49](https://github.com/koki-develop/Cork/commit/503fb49eccb0541bdaf0897e78b6e6dcf8763cd2))
* **mcp:** add create_task tool ([a6c378d](https://github.com/koki-develop/Cork/commit/a6c378dc87e9ad491929aafa1b0c46b9ac3999e2))
* **mcp:** add limit and offset pagination to list_tasks tool ([d90b813](https://github.com/koki-develop/Cork/commit/d90b813a5b10507cdc923b375cd0571e2cfe326a))
* **mcp:** add list_statuses tool ([b068c7c](https://github.com/koki-develop/Cork/commit/b068c7cfe39a6b2bba8c593d2d3bb0dfd2c67b08))
* **mcp:** add list_tags tool ([f9b8572](https://github.com/koki-develop/Cork/commit/f9b8572cbc22af4cff38441200348502a4d194ff))
* **mcp:** add query and filters arguments to list_tasks tool ([f55cdf3](https://github.com/koki-develop/Cork/commit/f55cdf3db40bdc053228f323bfa774020dc5a06a))
* **mcp:** add status filter to list_tasks tool ([9003ad1](https://github.com/koki-develop/Cork/commit/9003ad17bbcf70b47c8e60f3a72c9696e41b70a7))


### Bug Fixes

* **mcp:** add type field to mcp.json sample config ([4026f2f](https://github.com/koki-develop/Cork/commit/4026f2f1ddf3dd4f026aba73930e1d82c3c154aa))
* **mcp:** preserve field order in mcp.json sample config ([008279d](https://github.com/koki-develop/Cork/commit/008279d4bdaea167abbed9de5a897ff542344b3e))
* **ui:** separate Button focus ring from edge with outline-offset ([46151ae](https://github.com/koki-develop/Cork/commit/46151ae8fc3bae07d4d921db61d762c95131ff77))

## [0.3.0](https://github.com/koki-develop/Cork/compare/v0.2.0...v0.3.0) (2026-06-09)


### Features

* Add Cmd+N shortcut to open task creation dialog ([416f3a3](https://github.com/koki-develop/Cork/commit/416f3a36125c79f86ec59b5746c0c275f02d7daa))
* Implement workspaces history ([f8774ee](https://github.com/koki-develop/Cork/commit/f8774ee9aadee4faa1be063231f7b6dfc2b0be38))


### Bug Fixes

* Defer .cork.json creation until user changes settings ([cdb7599](https://github.com/koki-develop/Cork/commit/cdb75991144f07f28ef962a699573177c111aab8))

## [0.2.0](https://github.com/koki-develop/Cork/compare/v0.1.0...v0.2.0) (2026-06-08)


### Features

* Move task to top of new column on external status edit ([af7bba7](https://github.com/koki-develop/Cork/commit/af7bba71f1b671d53193c4bcbca18f4c08be9a03))


### Bug Fixes

* Fix icon ([b138547](https://github.com/koki-develop/Cork/commit/b1385472922d049b64ec1eb6e8f36e312a015d06))
* Skip IME composition keydowns in Escape handlers ([759814f](https://github.com/koki-develop/Cork/commit/759814f08e4dc5397ee906543f4a3e64fe0fd33a))

## [0.1.0](https://github.com/koki-develop/Cork/compare/v0.0.2...v0.1.0) (2026-06-08)


### Features

* Release v0.1.0 ([401c389](https://github.com/koki-develop/Cork/commit/401c38952dd58a6c30d4503eeceec75d4ff4db0b))
* Show app logo on WelcomePage ([2597feb](https://github.com/koki-develop/Cork/commit/2597feb46c09a366b835992604b2ceb21fb03f29))

## [0.0.2](https://github.com/koki-develop/Cork/compare/v0.0.1...v0.0.2) (2026-06-08)


### Features

* Release v0.0.2 ([60b9d3a](https://github.com/koki-develop/Cork/commit/60b9d3a94dd6d7ac8ac438aca9e9489ea9c825c3))

## 0.0.1 (2026-06-08)


### Features

* add confirmation dialog before removing a status ([0ef0e4e](https://github.com/koki-develop/Cork/commit/0ef0e4e841ca4b52410ccfa316c11ede3e2cb986))
* add copy-path action with toast feedback to task detail menu ([1299c85](https://github.com/koki-develop/Cork/commit/1299c850b68df0872ba8a19ee62968c6d5a0e4d1))
* add create task functionality ([49ba22f](https://github.com/koki-develop/Cork/commit/49ba22fce2ce2a260214b533a6875cfdc5973429))
* add drag-and-drop for task status changes ([82c8e94](https://github.com/koki-develop/Cork/commit/82c8e94fc4a0faf9652c02b915f733e905d0d5fb))
* add fuzzy task search with Cmd+F focus and cache invalidation ([7325c14](https://github.com/koki-develop/Cork/commit/7325c141166044bf7f4b1f5cd20ed18f85b988ab))
* add keyboard navigation to Select component ([cd57921](https://github.com/koki-develop/Cork/commit/cd57921a01bbb3255a5fe7f8223009d5b47811f3))
* add right-click context menu to board cards ([c00f48f](https://github.com/koki-develop/Cork/commit/c00f48f4f61f0186035873ab82a40e60caf34c2e))
* add settings screen with workspace directory persistence ([e3bb29a](https://github.com/koki-develop/Cork/commit/e3bb29a138fecc58e8c6bedfedc2aec24f8e8ef3))
* add tag filtering with 6 operators, popover UI, and per-workspace persistence ([ef4130b](https://github.com/koki-develop/Cork/commit/ef4130b90c4edc3fa747b8979fc8fdb4cec51be9))
* add task deletion from task detail dialog ([0ff397f](https://github.com/koki-develop/Cork/commit/0ff397f7b35a93becbd6094fc59fa953ec25366c))
* add task detail dialog with auto-save on blur ([3b8cf80](https://github.com/koki-develop/Cork/commit/3b8cf80fd5550b04ca01b50d45f7735b78b4f3c4))
* add task tags with frontmatter array, board chips, and dialog editor ([1458556](https://github.com/koki-develop/Cork/commit/14585569d75e1f0d9c3f91acdbed5605aead5304))
* add toast notifications on task creation via sonner ([8d1dd95](https://github.com/koki-develop/Cork/commit/8d1dd95aed79ae89125c0ef9fcee91a3b735387d))
* add Unknown lane for tasks with undefined status ([a8f558a](https://github.com/koki-develop/Cork/commit/a8f558aa1d6959ece30e11ceca554b124e78c5b1))
* allow Cmd+Enter to submit task creation dialog ([2e08711](https://github.com/koki-develop/Cork/commit/2e08711472a13c2410996408402e99805ed87bea))
* animate dialogs, dropdowns, selects, and page transitions ([25229be](https://github.com/koki-develop/Cork/commit/25229bead9d9b1ed06caacbdc83029fc057e5dca))
* auto-focus new status input when clicking Add Status ([a1f2549](https://github.com/koki-develop/Cork/commit/a1f25498d5e622aca0b77da65c13b5722eb7cad8))
* auto-refresh on external file changes via tauri-plugin-fs watch ([4310b46](https://github.com/koki-develop/Cork/commit/4310b4627127286352ae53e64065cb5b9cfbac4d))
* confirm before closing task creation dialog with unsaved input ([543f8a4](https://github.com/koki-develop/Cork/commit/543f8a4678ba8b89d2c0d8c26999342eb5fa33a1))
* defer workspace directory commit until Save in settings panel ([5d11903](https://github.com/koki-develop/Cork/commit/5d119038204103a9146dc3474201eda30dab68ed))
* enable tag autocomplete in task dialogs and fix removed-tag flash ([d922101](https://github.com/koki-develop/Cork/commit/d922101832353996836eefc8407e5e2872788c53))
* implement column drag reorder via unified useSortable hierarchy ([0f6cc1e](https://github.com/koki-develop/Cork/commit/0f6cc1e3333ca44de777b6f4365a4f583d3bd2ce))
* implement Markdown-based Kanban board view ([7b1e0e7](https://github.com/koki-develop/Cork/commit/7b1e0e7e575c7e3729b3a6cdf77a8f3716c5ff67))
* make autocomplete arrow keys wrap around in TagEditor ([c8a996a](https://github.com/koki-develop/Cork/commit/c8a996a673d3d9cd7aa84f4d5b7c8ab1fe65cf1a))
* migrate from @hello-pangea/dnd to @dnd-kit/react ([e2a343c](https://github.com/koki-develop/Cork/commit/e2a343cfe9af644ddfba7a0ae9bd6b40fabb6ca5))
* migrate settings status reorder from buttons to drag-and-drop ([9e49931](https://github.com/koki-develop/Cork/commit/9e499317f6aebc54799c76e8dea939986abff4d2))
* open settings from native menu bar (Cmd+,) and soften overlay blur ([8326b1c](https://github.com/koki-develop/Cork/commit/8326b1caaffa2758fc149582ad5335852c69ac5f))
* persist settings changes instantly without Save/Cancel buttons ([9ab807a](https://github.com/koki-develop/Cork/commit/9ab807ad7ceb3218b416fc89b3c2b538ccf799b8))
* persist task order via drag-and-drop with fractional indexing ([438e279](https://github.com/koki-develop/Cork/commit/438e2792015a6836df1f3046d3cb897709416270))
* polish tag autocomplete with hash icons and fuzzy match highlighting ([71009cb](https://github.com/koki-develop/Cork/commit/71009cbd7a537df9c736712f1f93b9dd6d8050d0))
* Release v0.0.1 ([bc6bdee](https://github.com/koki-develop/Cork/commit/bc6bdeefbe4c6968a33c15baf90434c780a51de9))
* remove native title bar and enable custom drag region on macOS ([cd86f8f](https://github.com/koki-develop/Cork/commit/cd86f8fb6655a082170684dc95ec20f3ebcbff5d))
* replace status remove button with three-dot dropdown menu ([94a277d](https://github.com/koki-develop/Cork/commit/94a277d7c7f58ab0e8c3c712e4bda09ab80bf00b))
* show card title up to 2 lines with ellipsis in board view ([38fa35a](https://github.com/koki-develop/Cork/commit/38fa35ae8402484a07d31a2640be91f3a66f97e0))
* store statuses per workspace via .cork.json ([901dc34](https://github.com/koki-develop/Cork/commit/901dc343c66f8b885a3cf0d15a4fa57ebcb31686))
* style error toasts with danger theme colors ([b95e11c](https://github.com/koki-develop/Cork/commit/b95e11c77bc8c40e3819200d0f9f390bae0902fa))
* sync task status when renaming status label ([1ab5a70](https://github.com/koki-develop/Cork/commit/1ab5a700a03e16fe63cd90e8531f0fce0f63dfbe))
* Tab selects autocomplete suggestion, no active selection when input empty ([98ec219](https://github.com/koki-develop/Cork/commit/98ec2198a5fa48da9677ad07ed847433ca29c9d3))
* trap Tab focus and highlight active item in DropdownMenu / ContextMenu ([61daad7](https://github.com/koki-develop/Cork/commit/61daad76d4c327893b761270560bd9e452a409cf))
* wrap and auto-resize task title input in create/edit dialogs ([16d8f8d](https://github.com/koki-develop/Cork/commit/16d8f8dd9e500346ded2db76dc98a15f7af1b118))
* 設定で任意のステータスを定義できるようにする ([88a1d14](https://github.com/koki-develop/Cork/commit/88a1d1492a971623ab6e8ab823dfef4f1daf413b))


### Bug Fixes

* add blank line between frontmatter and body ([e057adb](https://github.com/koki-develop/Cork/commit/e057adb750209cc5fb85ca38713a9d18b26fc6fc))
* align text in Select dropdown by adding placeholder for non-selected items ([1da2100](https://github.com/koki-develop/Cork/commit/1da2100cd1325784d91db6df2d74dd453ce26c95))
* capitalize app name from 'cork' to 'Cork' ([0b915ed](https://github.com/koki-develop/Cork/commit/0b915edaf36aba2058325757cc3a157cb3aa270d))
* close filter panel on Escape via global handler without stopPropagation ([ca3e336](https://github.com/koki-develop/Cork/commit/ca3e336fa931b6343ec8cb05e3b6f1cb15e17b1d))
* combine initial data loads into single async effect to avoid cascading renders ([c26823c](https://github.com/koki-develop/Cork/commit/c26823c1144150ed258293de8a3f624ae28ed1ee))
* confine focus trap and Escape to the top of the modal stack ([5a7f0b3](https://github.com/koki-develop/Cork/commit/5a7f0b3383faad4f33737cb316e01004afd83e05))
* deleted workspace tags now reappear in autocomplete suggestions ([26e6282](https://github.com/koki-develop/Cork/commit/26e62826d25f42b96517069ebc22d28a5e355dfd))
* don't close dialog when Escape is pressed inside an open DropdownMenu ([898fb63](https://github.com/koki-develop/Cork/commit/898fb630c89c6872577b48a94571423846bef8a0))
* don't close dialog when Escape is pressed inside an open Select dropdown ([3e9512d](https://github.com/koki-develop/Cork/commit/3e9512d7b91af1a5f4d00c6ebeec87ba8ea9b4cf))
* don't commit autocomplete suggestion on Cmd+Enter in TagEditor ([28e9b8f](https://github.com/koki-develop/Cork/commit/28e9b8fd7f87fdc8c149c7fe6e099465a847318e))
* don't treat case-only title rename as a duplicate ([f125a55](https://github.com/koki-develop/Cork/commit/f125a55120dd06afdcc3e18154ed47e96eea050d))
* drop card above target when target has negative order ([6396bb5](https://github.com/koki-develop/Cork/commit/6396bb533ec9a00a460da4800ccf3898ebcd7ece))
* drop card to correct slot in full-height lane empty area ([ff5f71f](https://github.com/koki-develop/Cork/commit/ff5f71f168b604770c33d2c3aa51e75d95ff5825))
* flip ContextMenu inside the viewport when it would overflow ([a1f0959](https://github.com/koki-develop/Cork/commit/a1f0959b78694ee79f7e782f7b58243dd52c0340))
* flush pending status edits on settings close and reset on error ([a778be1](https://github.com/koki-develop/Cork/commit/a778be11ac3141bbc77a6ad6452257b74b2810fd))
* focus input when clicking TagEditor padding area and set cursor style ([1f7afbf](https://github.com/koki-develop/Cork/commit/1f7afbfa7f13856a58fbf8adde3690fdb96a77f8))
* highlight column when dragging card over any card within it ([bb689ea](https://github.com/koki-develop/Cork/commit/bb689eab0ab224e3322244b00ffd9a6d874d5882))
* ignore IME-confirming Enter (keyCode 229) in TagEditor on WebKit ([1065926](https://github.com/koki-develop/Cork/commit/106592620043ab43d5176933f35c24f2fb1cb915))
* keep AppHeader above the Modal backdrop ([e5da019](https://github.com/koki-develop/Cork/commit/e5da019273056cdf43345e869b552476751c94c0))
* make droppable area fill column height for easier drag-and-drop ([c858997](https://github.com/koki-develop/Cork/commit/c858997b5fa8e073e76ebb002c31296b07e0a1cf))
* make task list scrollable with New Task button pinned at top ([41628ba](https://github.com/koki-develop/Cork/commit/41628ba46f68d41cff0a5ce9c6c3682a7fd43578))
* move statuses error banner inside StatusList below label ([ee0121f](https://github.com/koki-develop/Cork/commit/ee0121f7132be86fb6cddbbb2ebe320400753523))
* prevent default statuses from auto-restoring after manual deletion ([c4fd814](https://github.com/koki-develop/Cork/commit/c4fd814d984d7791b21ded6d81ebedbd282f9599))
* prevent extra "---" from being prepended to task body on update ([ee55da7](https://github.com/koki-develop/Cork/commit/ee55da7217aaab5afa826510f1b040337068b006))
* prevent post-drop flicker when moving cards across columns ([f2973b8](https://github.com/koki-develop/Cork/commit/f2973b86be9bcc104a26a65506a6b11ec742ccf5))
* prevent SearchBar focus when dragging a card over it ([94421b4](https://github.com/koki-develop/Cork/commit/94421b41007aacdde42ffd4ca494440e21953c8a))
* re-anchor TagEditor focus when input is disabled by maxTags ([dfa986b](https://github.com/koki-develop/Cork/commit/dfa986baaef9b83ca05713219c3fe09297644912))
* remove redundant transition classes from Select and KanbanCard ([11b5476](https://github.com/koki-develop/Cork/commit/11b54764ab5fc5e4c1bac64492e1907c476d2c7f))
* render Modal as a div so toasts appear above the backdrop ([527b2e5](https://github.com/koki-develop/Cork/commit/527b2e5e80143f805dfa4fbcebec372f7033bf4f))
* replace spacer div with semantic span in KanbanColumn ([3baca64](https://github.com/koki-develop/Cork/commit/3baca641ca219e68509adbdb080367fa88f0ad09))
* resolve react-doctor diagnostics (93→100) ([5e80ec4](https://github.com/koki-develop/Cork/commit/5e80ec4045c9ef9974569062e4d9d85082347bc6))
* resolve react-doctor diagnostics (no-manual-memoization, exhaustive-deps, unused-file) ([f8f96cf](https://github.com/koki-develop/Cork/commit/f8f96cf0fac3db75f0a6fd9de2b26cddb1efdafe))
* restore file watcher on app restart by registering fs scope in get_workspace_directory ([c9e6df2](https://github.com/koki-develop/Cork/commit/c9e6df2504165f4ea58c89b1aaa488d144d769f6))
* rollback optimistic task update when save fails ([bd48475](https://github.com/koki-develop/Cork/commit/bd48475854e7e614f25e05b4c634f679c6e6467b))
* stabilize task and settings dialog close on auto-save errors ([7980b82](https://github.com/koki-develop/Cork/commit/7980b8293ecbc94568484793882588ff05d58055))
* status reorder no longer incorrectly rewrites task statuses ([eb528d2](https://github.com/koki-develop/Cork/commit/eb528d21ddd3a34c2b126fcf9864799d88a9b149))
* stop Shift+Tab from leaking out of the focus trap ([773e49e](https://github.com/koki-develop/Cork/commit/773e49ed3697e06b5b81ac60a8c9cd243abafce9))
* trap Tab focus inside the tag filter popover ([6e23a0d](https://github.com/koki-develop/Cork/commit/6e23a0d385ddda982f1da6e5f2cfd6721250560e))
* truncate overflowing status names and task titles ([fa83cd8](https://github.com/koki-develop/Cork/commit/fa83cd8cdabaab3b4af961c744cb2fec88caac33))
* write order before status in drag-end handler to prevent flicker ([85942e4](https://github.com/koki-develop/Cork/commit/85942e4bde659bfe62d1c2cabca5fbe79ac42a31))


### Performance Improvements

* parallelize list_tasks file processing with rayon ([4621b2e](https://github.com/koki-develop/Cork/commit/4621b2e5cc70426b5353a2ad9a784476669deff4))
* parallelize status rename frontmatter rewrite with rayon ([c195005](https://github.com/koki-develop/Cork/commit/c195005f37817f48bb34117d05b4b2029aaeb4cc))
* reduce list_tasks I/O to frontmatter and 2-line body preview ([33f9c8b](https://github.com/koki-develop/Cork/commit/33f9c8bc74dce50ed665813476587e869856ca85))
