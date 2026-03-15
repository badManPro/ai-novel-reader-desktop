# Progress Log

## Session: 2026-03-15

### Session Addendum: Step Recovery
- **Status:** complete
- Actions taken:
  - 重新读取 `task_plan.md`、`findings.md`、`progress.md` 与 `docs/C-END-REFACTOR-PLAN.md`，恢复当前任务上下文。
  - 确认 Step 1 对应的 `AppShell`、`routes.tsx`、`LibraryPage`、`BookDetailPage`、`ReaderPage` 骨架文件已存在于仓库中。
  - 将下一执行目标收敛为 Step 2：书库页重构，避免重复搭建已存在的路由层。
- Files created/modified:
  - `findings.md` (updated)
  - `progress.md` (updated)

### Step 2: 书库页重构
- **Status:** complete
- Actions taken:
  - 新增 `src/renderer/hooks/useLibraryState.ts`，复用书架加载、导入、删除与最近阅读推导逻辑。
  - 新增 `src/renderer/components/library/LibraryHero.tsx` 与 `src/renderer/components/library/LibraryBookCard.tsx`，将书库首页拆成可复用区块。
  - 将 `src/renderer/pages/library/LibraryPage.tsx` 从占位骨架改成真实书库页，接入最近阅读、导入、删除、详情跳转与空状态。
  - 更新 `src/renderer/app/AppShell.tsx` 与 `src/renderer/styles/app-shell.css`，清理过期 Step 1 文案并补齐书库页样式。
- Files created/modified:
  - `src/renderer/hooks/useLibraryState.ts` (created)
  - `src/renderer/components/library/LibraryHero.tsx` (created)
  - `src/renderer/components/library/LibraryBookCard.tsx` (created)
  - `src/renderer/pages/library/LibraryPage.tsx` (updated)
  - `src/renderer/app/AppShell.tsx` (updated)
  - `src/renderer/styles/app-shell.css` (updated)

### Step 3: 书籍详情页重构
- **Status:** complete
- Actions taken:
  - 新增 `src/renderer/components/book/BookHero.tsx` 与 `src/renderer/components/book/BookChapterList.tsx`，把详情页拆成主操作区和章节列表区。
  - 将 `src/renderer/pages/book/BookDetailPage.tsx` 从骨架页改成真实书籍详情页，接入书籍元信息、阅读进度、章节选择、继续阅读、开始朗读、删除书籍与独立清理缓存。
  - 扩展 `src/renderer/hooks/useLibraryState.ts`，补充保存章节进度与清理书籍缓存的过渡数据能力。
  - 新增 `clearBookCache(bookId)` 到 `src/shared/types.ts`、`src/preload/index.ts`、`src/main/index.ts`，让详情页具备独立缓存清理动作。
  - 更新 `src/renderer/app/AppShell.tsx` 与 `src/renderer/styles/app-shell.css`，同步详情页文案与样式。
- Files created/modified:
  - `src/renderer/components/book/BookHero.tsx` (created)
  - `src/renderer/components/book/BookChapterList.tsx` (created)
  - `src/renderer/pages/book/BookDetailPage.tsx` (updated)
  - `src/renderer/hooks/useLibraryState.ts` (updated)
  - `src/shared/types.ts` (updated)
  - `src/preload/index.ts` (updated)
  - `src/main/index.ts` (updated)
  - `src/renderer/app/AppShell.tsx` (updated)
  - `src/renderer/styles/app-shell.css` (updated)

### Step 4: 阅读器页重构
- **Status:** complete
- Actions taken:
  - 新增 `src/renderer/hooks/useReaderPageState.ts`，把阅读页的滚动恢复、滚动保存、播放状态订阅和章节抽屉状态从旧 `ReaderShell` 分离出来。
  - 新增 `src/renderer/components/reader/ReaderContent.tsx`、`src/renderer/components/reader/ReaderChapterDrawer.tsx`、`src/renderer/components/reader/ReaderPlaybackPanel.tsx`，把正文渲染、章节目录和播放状态拆成独立组件。
  - 重写 `src/renderer/pages/reader/ReaderPage.tsx`，让阅读页由 `/reader/:bookId/:chapterId` 路由参数驱动，不再复用 `ReaderShell`。
  - 新增 `src/renderer/lib/playback-metrics.ts`，抽出播放状态摘要、时间线和指标计算，作为后续全局播放器 Dock 的复用基础。
  - 更新 `src/renderer/styles/app-shell.css`，补充沉浸式阅读页、章节抽屉和阅读侧栏样式。
- Files created/modified:
  - `src/renderer/hooks/useReaderPageState.ts` (created)
  - `src/renderer/components/reader/ReaderContent.tsx` (created)
  - `src/renderer/components/reader/ReaderChapterDrawer.tsx` (created)
  - `src/renderer/components/reader/ReaderPlaybackPanel.tsx` (created)
  - `src/renderer/lib/playback-metrics.ts` (created)
  - `src/renderer/pages/reader/ReaderPage.tsx` (updated)
  - `src/renderer/styles/app-shell.css` (updated)

### Step 5: 全局播放器 Dock
- **Status:** complete
- Actions taken:
  - 新增 `src/renderer/app/AppFrame.tsx`，将路由外层升级为“页面内容 + 全局播放器 Dock”的统一壳层。
  - 新增 `src/renderer/hooks/usePlaybackDockState.ts` 与 `src/renderer/components/player/PlayerDock.tsx`，把播放状态订阅、队列信息、控制动作和调试指标统一抽到跨页面共享层。
  - 更新 `src/renderer/app/routes.tsx`，让书库、详情、阅读、设置全部经过 `AppFrame`，共享同一层播放器。
  - 收窄 `src/renderer/pages/reader/ReaderPage.tsx`，移除页面内重复的播放面板，只保留章节相关操作和阅读快照。
  - 更新 `src/renderer/styles/app-shell.css`，补充 Dock、外层壳和收窄后的阅读页样式，并删除旧 `ReaderPlaybackPanel.tsx`。
- Files created/modified:
  - `src/renderer/app/AppFrame.tsx` (created)
  - `src/renderer/hooks/usePlaybackDockState.ts` (created)
  - `src/renderer/components/player/PlayerDock.tsx` (created)
  - `src/renderer/app/routes.tsx` (updated)
  - `src/renderer/pages/reader/ReaderPage.tsx` (updated)
  - `src/renderer/styles/app-shell.css` (updated)
  - `src/renderer/components/reader/ReaderPlaybackPanel.tsx` (deleted)

### Step 6: 设置中心拆分
- **Status:** complete
- Actions taken:
  - 新增 `src/renderer/components/settings/SettingsLayout.tsx`、`src/renderer/hooks/useSettingsState.ts` 与 `src/renderer/pages/settings/useSettingsOutlet.ts`，让设置中心通过统一状态层和 `Outlet context` 向五个子页分发数据。
  - 将 `src/renderer/pages/settings/TtsSettingsPage.tsx` 接入默认 Provider、音色、倍速和试听能力。
  - 将 `src/renderer/pages/settings/ReadingSettingsPage.tsx` 接入字号、行高和主题设置。
  - 将 `src/renderer/pages/settings/OfflineSettingsPage.tsx` 接入离线健康概览，并迁入 `ModelManagementPanel`。
  - 将 `src/renderer/pages/settings/DataSettingsPage.tsx` 接入缓存指标、草稿队列和按书清理缓存能力。
  - 将 `src/renderer/pages/settings/AboutSettingsPage.tsx` 接入应用版本、支持格式和产品说明，并更新 `SettingsPage`、`AppShell` 和样式。
- Files created/modified:
  - `src/renderer/components/settings/SettingsLayout.tsx` (created)
  - `src/renderer/hooks/useSettingsState.ts` (created)
  - `src/renderer/pages/settings/useSettingsOutlet.ts` (created)
  - `src/renderer/pages/settings/SettingsPage.tsx` (updated)
  - `src/renderer/pages/settings/TtsSettingsPage.tsx` (updated)
  - `src/renderer/pages/settings/ReadingSettingsPage.tsx` (updated)
  - `src/renderer/pages/settings/OfflineSettingsPage.tsx` (updated)
  - `src/renderer/pages/settings/DataSettingsPage.tsx` (updated)
  - `src/renderer/pages/settings/AboutSettingsPage.tsx` (updated)
  - `src/renderer/app/AppShell.tsx` (updated)
  - `src/renderer/styles/app-shell.css` (updated)

### Step 7: TTS 策略落地
- **Status:** complete
- Actions taken:
  - 新增 `src/shared/tts-strategy.ts`，把标准 / 隐私 / 角色三种模式的默认 Provider、音色、迁移逻辑与播放请求构建统一收口。
  - 扩展 `src/shared/types.ts`、`src/main/services/reader-state-schema.ts` 与 `src/main/services/reader-store-service.ts`，让 Reader Settings 可持久化三套模式配置，并继续兼容旧的 `defaultProviderId/defaultVoiceId`。
  - 更新 `src/main/services/playback-service.ts` 与 `src/main/services/chapter-playback-queue.ts`，在云端 Provider 失败时把剩余播放队列切到本地兜底 Provider，并按兜底链路的切片上限保证继续可播。
  - 更新 `src/main/services/tts-catalog-service.ts` 及相关 Provider 描述，把列表顺序和文案调整为云端优先、本地兜底。
  - 重写 `src/renderer/hooks/useSettingsState.ts` 与 `src/renderer/pages/settings/TtsSettingsPage.tsx`，让设置页可编辑三种模式并用策略概览卡片明确远程首选 / 本地兜底。
  - 更新 `src/renderer/hooks/useReaderPageState.ts` 与 `src/renderer/pages/book/BookDetailPage.tsx`，让详情页与阅读页的朗读入口统一走新策略请求构建器。
- Files created/modified:
  - `src/shared/tts-strategy.ts` (created)
  - `src/shared/types.ts` (updated)
  - `src/main/services/reader-state-schema.ts` (updated)
  - `src/main/services/reader-store-service.ts` (updated)
  - `src/main/services/chapter-playback-queue.ts` (updated)
  - `src/main/services/playback-service.ts` (updated)
  - `src/main/services/tts-catalog-service.ts` (updated)
  - `src/main/adapters/openai-tts-adapter.ts` (updated)
  - `src/main/adapters/cosyvoice-tts-adapter.ts` (updated)
  - `src/main/adapters/system-tts-adapter.ts` (updated)
  - `src/renderer/hooks/useSettingsState.ts` (updated)
  - `src/renderer/pages/settings/TtsSettingsPage.tsx` (updated)
  - `src/renderer/hooks/useReaderPageState.ts` (updated)
  - `src/renderer/pages/book/BookDetailPage.tsx` (updated)

### Phase 1: Requirements & Discovery
- **Status:** complete
- **Started:** 2026-03-15
- Actions taken:
  - 阅读 `planning-with-files` 技能说明并执行复杂任务工作流。
  - 检查当前项目结构与关键 renderer / docs 文件。
  - 确认用户要求的 TTS 策略已从“离线优先”转为“云端优先，本地兜底”。
  - 确认当前前端主要问题是单组件承载过多职责、页面分层不足、视觉层级不清。
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (created)

### Phase 2: Planning & Structure
- **Status:** complete
- Actions taken:
  - 结合现有代码梳理出书架、阅读、设置、模型管理、TTS 状态等核心域。
  - 确定新文档会覆盖产品定位修正、信息架构、页面树、视觉方向、模块拆分与分阶段实施。
- Files created/modified:
  - `task_plan.md` (updated)
  - `findings.md` (updated)
  - `progress.md` (updated)

### Phase 3: Documentation Delivery
- **Status:** complete
- Actions taken:
  - 新增 `docs/C-END-REFACTOR-PLAN.md`，系统写明产品方向校正、信息架构、页面规划、TTS 策略、视觉方向、模块拆分和实施阶段。
  - 将现有 `ReaderShell`、`ModelManagementPanel`、`global.css` 的问题映射到具体重构动作。
- Files created/modified:
  - `docs/C-END-REFACTOR-PLAN.md` (created)

### Phase 4: Verification
- **Status:** complete
- Actions taken:
  - 自检新增文档，确认与当前代码结构和文件位置一致。
  - 确认只新增规划与文档文件，没有覆盖用户现有代码改动。
  - 按新要求将文档升级为详细执行手册，补充逐步任务、下一步指向和 git 提交规则。
- Files created/modified:
  - `task_plan.md` (updated)
  - `progress.md` (updated)
  - `docs/C-END-REFACTOR-PLAN.md` (updated)

### Phase 5: Delivery
- **Status:** complete
- Actions taken:
  - 完成面向用户的交付准备，整理最终文档位置与关键结论。
  - 检查当前 git 状态与远程配置，准备仅提交本次新增文档。
- Files created/modified:
  - `task_plan.md` (updated)
  - `progress.md` (updated)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| 项目结构核对 | `rg --files`, `sed`, `wc -l` | 找到关键 UI / docs 文件与体量 | 已确认 `ReaderShell.tsx` 1125 行、`global.css` 612 行 | ✓ |
| 文档落地检查 | `sed -n`, `git status --short` | 新文档存在且仅新增规划文件 | 已确认 `docs/C-END-REFACTOR-PLAN.md` 与三份规划文件已新增 | ✓ |
| Step 1 核对 | `sed -n`, `rg -n` | 判断是否需要重复实现路由骨架 | 已确认 `AppShell` / `routes.tsx` / `pages/*` 已存在，可直接进入 Step 2 | ✓ |
| Step 2 类型检查 | `npm run typecheck` | 新增书库页与 hook 编译通过 | 通过 | ✓ |
| Step 2 lint 检查 | `npm run lint` | 验证前端改动无 lint 错误 | 失败：仓库缺少 ESLint v9 所需 `eslint.config.*` | ⚠ |
| Step 3 类型检查 | `npm run typecheck` | 新增详情页、IPC 与缓存接口编译通过 | 首次因回调签名不匹配失败，修正后通过 | ✓ |
| Step 3 lint 检查 | `npm run lint` | 验证详情页改动无 lint 错误 | 仍失败：仓库缺少 ESLint v9 所需 `eslint.config.*` | ⚠ |
| Step 4 类型检查 | `npm run typecheck` | 新增阅读页 hook、组件和样式编译通过 | 首次因 `ref` 类型不匹配失败，修正后通过 | ✓ |
| Step 4 lint 检查 | `npm run lint` | 验证阅读页改动无 lint 错误 | 仍失败：仓库缺少 ESLint v9 所需 `eslint.config.*` | ⚠ |
| Step 5 类型检查 | `npm run typecheck` | 新增全局播放器 Dock 和路由外层壳编译通过 | 通过 | ✓ |
| Step 5 lint 检查 | `npm run lint` | 验证全局播放器改动无 lint 错误 | 仍失败：仓库缺少 ESLint v9 所需 `eslint.config.*` | ⚠ |
| Step 6 类型检查 | `npm run typecheck` | 新增 SettingsLayout、hook 与五个子页编译通过 | 通过 | ✓ |
| Step 6 lint 检查 | `npm run lint` | 验证设置中心拆分改动无 lint 错误 | 仍失败：仓库缺少 ESLint v9 所需 `eslint.config.*` | ⚠ |
| Step 7 类型检查 | `npm run typecheck` | 新增策略类型、主进程兜底逻辑与设置页模式编辑编译通过 | 通过 | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-03-15 | 规划文件不存在 | 1 | 手动新建三份规划文件 |
| 2026-03-15 | `npm run lint` 失败，提示缺少 `eslint.config.*` | 1 | 记录为仓库现有配置缺口，本步先以 `typecheck` 作为验证 |
| 2026-03-15 | `LibraryBookCard` 的删除回调类型过窄，导致 Step 3 `typecheck` 失败 | 1 | 将回调签名从 `Promise<void>` 放宽为 `Promise<unknown>`，重新检查通过 |
| 2026-03-15 | `ReaderContent` 的 `ref` 类型与 `HTMLElement` 不匹配，导致 Step 4 `typecheck` 失败 | 1 | 调整 `useRef` 与组件 `RefObject` 类型，并显式透出当前滚动位置 |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | 已完成 Step 7：TTS 策略落地 |
| Where am I going? | Step 8：视觉系统与样式拆分 |
| What's the goal? | 按执行手册逐步把单体阅读工作台拆成面向 C 端的多层页面结构 |
| What have I learned? | 云端优先策略如果要真实可用，必须把模式默认值、请求构建和播放失败后的剩余队列切换统一到同一套策略解析器里 |
| What have I done? | 已完成 Step 2 书库页、Step 3 详情页、Step 4 阅读器页、Step 5 全局播放器 Dock、Step 6 设置中心拆分、Step 7 TTS 策略落地与对应类型检查 |
