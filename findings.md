# Findings & Decisions

## Requirements
- 用户确认 TTS 策略暂定为 `gpt-4o-mini-tts` 所代表的云端路线。
- 长文本默认改成云端 TTS，本地模型只做离线兜底。
- 云端 TTS 负责整章连续朗读，本地模型用于无网、隐私敏感、角色声线等场景。
- 本地模型只保留轻量保底方案，主打启动快、响应快。
- 需要将当前平铺、拥挤、不好看的单层页面重构成面向 C 端用户的产品界面。
- 需要增加多层页面与清晰导航，至少包含设置页、书库等模块。
- 需要输出一份详细的改造重构文档。
- 重构任务文档需要进一步细化成按步骤执行的手册。
- 每完成一步都需要明确下一步任务。
- 每一步都需要生成独立 commit 并提交到远程。

## Research Findings
- 当前 renderer 入口极薄：`src/renderer/App.tsx` 只渲染 `ReaderShell`。
- 当前主 UI 过度集中在 `src/renderer/components/ReaderShell.tsx`，文件长度为 1125 行，承担阅读、书架、设置、播放、模型管理等多种职责。
- 当前全局样式集中在 `src/renderer/styles/global.css`，文件长度为 612 行，说明视觉系统与布局也未拆分。
- 当前前端视图切换只有 `reader` / `settings` 两个 tab，仍属于“单页内切换”，不是真正的多层页面结构。
- `README.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md` 仍把离线 TTS 写成主路线，与用户刚确认的新方向冲突。
- `src/shared/types.ts` 已经具备 `remote` / `local` provider 类型基础，可支撑新的主次策略定义。
- 现有项目已经具备书架、章节、阅读位置、TTS 队列、离线引擎状态等底层能力，问题主要集中在产品表达层与前端结构层。
- 当前仓库已存在 `src/renderer/app/AppShell.tsx`、`src/renderer/app/routes.tsx` 以及 `src/renderer/pages/library|book|reader` 目录，说明 Step 1 的路由骨架已经开始落地，不需要从零搭建。
- 当前 `ReaderPage` 仍直接复用旧 `ReaderShell`，而 `LibraryPage` / `BookDetailPage` 还是占位骨架，因此更合理的下一步是继续执行 Step 2，把书库页接入真实书架数据与主操作流。
- `LibraryPage` 已成功接入真实 `loadReaderState / importTxtBook / deleteBook` 数据流，当前默认首页已经具备最近阅读、导入、删除、详情跳转这四条主路径。
- 为避免在 Step 2 就改动过大的旧阅读器逻辑，本次新增 `src/renderer/hooks/useLibraryState.ts` 作为过渡数据层，暂不直接拆动 `ReaderShell`。
- `AppShell` 中原有 “Step 1 Skeleton” 文案已经过时，需要随着每步推进同步更新，否则会误导后续执行人。
- 为满足 Step 3 的“清理缓存”要求，当前 renderer 需要补独立的 `clearBookCache(bookId)` IPC/API；现有代码此前只有“删除书籍时顺带清缓存”。
- `BookDetailPage` 已接入真实书籍数据、阅读进度和章节选择；“继续阅读”通过持久化 `recentBookId + progress` 后跳转阅读页，“从当前章节开始朗读”则直接调用 `api.speak()` 再跳转。
- 当前 `ReaderPage` 仍由旧 `ReaderShell` 承接，因此详情页最稳妥的过渡方案不是改阅读器参数协议，而是先在详情页内触发朗读，再让阅读页接管状态展示。
- Step 4 的最佳落点不是继续拆旧 `ReaderShell`，而是新建一条由路由参数驱动的阅读页数据流；这样可以避免与用户当前正在修改的 `ReaderShell.tsx` 直接冲突。
- 新阅读页已经把设置大卡片、模型控制台和书架删除动作移出视图，只保留正文阅读、章节目录抽屉和播放状态面板，符合执行手册的单一职责要求。
- 为减少后续 Step 5 重复搬运，已把播放状态摘要、时间线和指标计算提取到 `src/renderer/lib/playback-metrics.ts`，后续全局 Player Dock 可直接复用。
- 当前阅读页的 TTS 控制仍使用“默认 Provider / 默认音色 / 默认倍速”，配置入口不再在阅读页暴露，需由设置页统一管理。
- Step 5 通过新增 `AppFrame` 把 `PlayerDock` 提升到了所有路由外层，避免分别在 `AppShell` 和 `ReaderPage` 上各挂一份播放器。
- 全局 Dock 已承接播放状态、暂停/继续/停止、当前书籍/章节、队列规模和可展开的调试指标；阅读页只保留“开始朗读当前章”和章节相关信息。
- 设置页当前是骨架页，并未展示大状态面板，因此 Step 5 的“去重”重点落在阅读页而不是设置页；后续 Step 6 拆真实设置表单时应继续复用 Dock 而不是重新堆一份播放卡片。
- Step 6 通过 `SettingsLayout + useSettingsState + Outlet context` 把设置中心真正拆成二级页面结构，而不是继续在 `SettingsPage` 里硬塞所有逻辑。
- `TtsSettingsPage` 现在承接默认 Provider / 音色 / 倍速与试听，`ReadingSettingsPage` 承接字号 / 行高 / 主题，`OfflineSettingsPage` 承接健康检查与 `ModelManagementPanel`，`DataSettingsPage` 承接缓存与草稿队列，`AboutSettingsPage` 承接版本与产品说明。
- 由于 Step 7 还未开始，本次没有修改共享类型里的 TTS 策略字段；设置页里只先把“模式预览”和当前默认配置摆正，为下一步的云端优先 / 本地兜底策略落地留位。
- 设置页已明确依赖全局 `PlayerDock` 查看播放状态，因此没有再重复嵌入一份大的播放态势面板。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 新增一份独立的产品改造重构文档，而不是直接覆盖旧 PRD | 便于清晰表达“方向调整”与“实施方案”，避免混淆历史文档 |
| 文档重点覆盖 IA、页面树、视觉方向、组件拆分、状态边界、实施阶段 | 这是后续 UI 重构与开发排期最需要的内容 |
| 将模型管理从一级核心页面降级为设置页中的二级能力 | 面向 C 端产品时，用户主路径不应被底层部署台占据 |
| 书库、阅读器、播放器、设置应成为清晰的一层或二层页面 | 解决“内容乱挤”和用户心智不清的问题 |
| 将执行计划细化为 Step 0 到 Step 10 的顺序手册 | 用户要求文档可以按步骤落地执行 |
| 为每个步骤附带下一步与 git push 模板 | 用户要求每步结束后都能直接推进并提交远程 |
| 将当前执行点判定为 Step 2，而不是重复实现 Step 1 | 仓库内已有 App Shell 与路由骨架文件，且阅读页已通过 `ReaderPage` 承接旧 `ReaderShell` 过渡 |
| Step 3 为“独立清缓存”补充新的 preload/main/shared 类型接口 | 这是书籍详情页动作完整性所必需，且不会破坏现有删除书籍流程 |
| 详情页继续复用 `useLibraryState` 作为过渡数据层，而不立刻新建更重的状态管理 | 当前目标是尽快把章节与主操作迁出全局侧栏，避免过早投入状态重构 |
| Step 4 新增 `useReaderPageState` 而不是继续向 `useLibraryState` 塞所有播放逻辑 | 阅读页需要自己的滚动位置、播放订阅和章节抽屉状态，独立 hook 更利于 Step 5 继续拆 Dock |
| 保留 `ReaderShell` 作为旧工作台，不在本步直接改写 | 当前工作树里该文件已有用户改动，避免在阅读页重构时发生无关冲突 |
| Step 5 新增 `usePlaybackDockState` 作为全局播放器状态层 | 书库、详情、阅读、设置都需要同一份播放状态，不适合继续挂在页面级 hook 上 |
| 用 `AppFrame -> AppShell/ReaderPage` 的两层结构承接全局 Dock | 这样既保留阅读页的沉浸布局，也能保证 Dock 跨页面共享 |
| Step 6 使用 `Outlet context` 向设置子页透传状态，而不是为每个子页单独加载一遍 API 数据 | 避免重复请求与状态漂移，也让五个子页共享同一份保存/刷新动作 |
| `ModelManagementPanel` 保持原组件不动，只迁移到“离线与模型”子页 | 该组件复杂度较高，先挪位置比重写更稳妥 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 旧文档路线与新方向冲突 | 在新文档中单列“方向校正”，以后续文档更新为准 |
| 工作树存在用户已有改动 | 仅新增文档与规划文件，不回滚任何现有更改 |
| `npm run lint` 无法执行 | 仓库当前缺少 ESLint v9 所需的 `eslint.config.*`，先以 `npm run typecheck` 作为本步验证，后续单独补齐 lint 配置 |

## Resources
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/components/ReaderShell.tsx`
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/styles/global.css`
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/shared/types.ts`
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/README.md`
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/docs/PRD.md`
- `/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/docs/ARCHITECTURE.md`

## Visual/Browser Findings
- 当前界面通过左侧 sidebar + 右侧 reader 的两栏布局承载几乎全部功能，导致书架、章节、设置、模型管理互相争抢空间。
- 当前按钮、卡片、摘要区样式虽然有基础玻璃感，但层级、间距、主次关系不足，无法支撑消费级产品观感。
- 当前“模型管理 / 部署控制台”信息密度偏开发工具化，不适合直接暴露为 C 端主界面核心内容。
