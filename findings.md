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
