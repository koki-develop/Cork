# Changelog

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
