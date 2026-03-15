# Task Plan: C 端产品化页面重构与 TTS 策略改造文档

## Goal
基于当前项目真实代码结构，输出一份面向 C 端产品化的详细改造重构文档，明确“云端 TTS 主朗读、本地模型离线兜底”的产品路线，以及页面层级、信息架构、技术拆分和实施阶段。

## Current Phase
Phase 11

## Phases

### Phase 1: Requirements & Discovery
- [x] 理解用户意图与产品方向调整
- [x] 识别当前代码与文档中的冲突点
- [x] 将关键发现记录到 findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] 明确文档目标读者与交付范围
- [x] 定义信息架构、页面拆分与导航策略
- [x] 设计技术重构顺序与落地阶段
- **Status:** complete

### Phase 3: Documentation Delivery
- [x] 编写正式改造重构文档
- [x] 补充与现有代码对应的模块拆分建议
- [x] 写明验收标准与实施优先级
- **Status:** complete

### Phase 4: Verification
- [x] 自检文档是否与当前代码结构一致
- [x] 确认未覆盖用户未要求的破坏性改动
- [x] 记录交付结果到 progress.md
- **Status:** complete

### Phase 5: Delivery
- [x] 复核最终输出
- [x] 向用户说明文档位置与关键结论
- [x] 标注后续建议动作
- **Status:** complete

### Phase 6: Step Execution Recovery & Next Implementation
- [x] 读取执行手册并恢复当前任务上下文
- [x] 核对 Step 1 路由骨架是否已存在于当前代码
- [x] 执行下一步 Step 2：书库页重构
- [x] 完成验证并回写规划文件
- **Status:** complete

### Phase 7: Step 3 Preparation
- [x] 进入 Step 3：书籍详情页重构
- [x] 将章节列表、阅读进度和主操作从侧栏迁移到详情页
- [x] 为详情页建立与书库页一致的数据入口
- [x] 补充独立的书籍缓存清理接口
- **Status:** complete

### Phase 8: Step 4 Preparation
- [x] 进入 Step 4：阅读器页重构
- [x] 拆出正文渲染与章节导航的阅读页职责
- [x] 将设置与模型控制从阅读页中继续剥离
- [x] 保留阅读滚动位置保存逻辑
- **Status:** complete

### Phase 9: Step 5 Preparation
- [x] 进入 Step 5：全局播放器 Dock
- [x] 将当前阅读页中的播放状态面板抽成跨页面共享层
- [x] 统一书库、详情、阅读、设置的播放入口
- [x] 区分产品化主状态与可展开调试状态
- **Status:** complete

### Phase 10: Step 6 Preparation
- [x] 进入 Step 6：设置中心拆分
- [x] 将真实朗读设置、阅读设置、数据与缓存设置迁移到设置页
- [x] 避免在设置页重新堆一份重复播放器状态
- [x] 将 `ModelManagementPanel` 迁入“离线与模型”
- **Status:** complete

### Phase 11: Step 7 Preparation
- [ ] 进入 Step 7：TTS 策略落地
- [ ] 在共享类型与设置页中引入标准 / 隐私 / 角色模式
- [ ] 明确远程首选 Provider 与本地兜底 Provider 的策略边界
- **Status:** pending

## Key Questions
1. 当前项目从“离线主路线”切换为“云端主路线”后，产品定位和设置层级应如何调整？
2. 现有单页式 `ReaderShell` 应拆成哪些页面、壳层和业务模块？
3. 如何在不打断现有 Electron 主进程与 TTS 能力的前提下推进前端重构？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 `planning-with-files` 技能管理此次复杂规划任务 | 该任务涉及多轮代码与文档调研，适合持久化规划 |
| 文档以现有代码为基础，不做脱离实现的空泛产品稿 | 用户要的是可落地改造文档，不是概念方案 |
| 将“云端长文本朗读、本地离线兜底”作为新产品方向写入主文档 | 这是用户刚刚明确确认的新策略，优先级最高 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 规划文件不存在 | 1 | 按技能要求新建 `task_plan.md`、`findings.md`、`progress.md` |

## Notes
- 当前工作树有用户已有未提交修改，不能覆盖或回滚。
- 现有 README / PRD / ARCHITECTURE 仍以离线主路线为主，需要在新文档里明确指出方向已变更。
- 当前仓库已包含 App Shell 与基础页面骨架，执行点已从“写文档”切换到“按手册继续实现代码步骤”。
- Step 2 已完成，当前默认 `/library` 页面已接入真实书架数据与主操作。
- Step 3 已完成，书籍详情页已接入真实书籍数据、章节选择、继续阅读、开始朗读、删除书籍与独立清缓存。
- Step 4 已完成，新 `ReaderPage` 已由路由参数驱动，只保留正文、章节抽屉和播放状态，不再复用旧 `ReaderShell`。
- Step 5 已完成，所有一级页面都共享 `PlayerDock`，阅读页内不再重复挂一套完整播放器。
- Step 6 已完成，设置中心已拆成五个真实子页，并通过统一状态层共享数据与保存动作。
- `npm run lint` 受限于仓库缺少 ESLint v9 flat config，后续如需 lint 需先补配置。
