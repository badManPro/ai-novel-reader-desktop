# C 端产品化改造与页面重构方案

## 1. 文档目的

这份文档用于指导 `AI Novel Reader Desktop` 从当前的“功能堆叠式工程界面”升级为面向普通用户的 C 端产品界面，并同步校正 TTS 路线：

- **长文本默认走云端 TTS**
- **本地模型只做离线兜底**
- **本地模型只保留轻量保底能力**
- **角色声线、本地隐私、无网场景再启用本地模型**

这不是纯视觉稿，而是一份可直接指导后续开发拆分的重构文档。

## 2. 方向校正

### 2.1 新的产品路线

当前仓库中的 `README.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md` 仍以“离线 TTS 主路线”叙述产品。但当前已确认的新方向是：

1. **默认主链路是云端 TTS**
2. **默认承担整章、长文本、连续朗读的是 OpenAI TTS / 其他云端语音服务**
3. **本地模型不再作为默认主链路**
4. **本地模型仅用于以下场景**
   - 无网或云端不可用
   - 用户主动开启隐私优先
   - 用户需要角色声线、克隆或本地化演绎
5. **本地只保留轻量保底模型**
   - 优先快启动
   - 优先快返回
   - 不再让大体积本地模型占据默认用户路径

### 2.2 新的产品定位

产品不再强调“本地模型部署工具”，而是强调：

- 这是一个**更好看、更顺手、能看也能听的桌面小说阅读器**
- AI 朗读是核心体验，但应该被包装成**低门槛、低学习成本、低配置焦虑**的消费级能力
- 用户主路径应该是：
  - 导入书
  - 进入书库
  - 继续阅读
  - 一键朗读
  - 在必要时再进入设置

## 3. 当前问题诊断

结合现有实现，当前主要问题不是能力缺失，而是产品表达和页面结构失衡。

### 3.1 产品层问题

1. **界面更像开发中控台，不像面向普通用户的阅读器**
2. **“离线模型管理”权重过高，压过了书籍、阅读、收听本身**
3. **缺少真正的书库首页，用户进入应用后没有清晰主路径**
4. **阅读、设置、模型部署、缓存、状态信息被放在同一个壳层中，决策负担太大**

### 3.2 信息架构问题

当前 renderer 基本等于：

- `src/renderer/App.tsx` 仅渲染 `ReaderShell`
- `src/renderer/components/ReaderShell.tsx` 承载几乎全部页面职责

存在的问题：

1. 当前只有 `reader` / `settings` 两个视图切换，不是完整多层页面
2. 左侧边栏同时承载品牌、导航、书架、章节列表、能力说明
3. 右侧区域同时承载阅读区、播放器、状态区、设置区
4. 设置中心内部又继续承载模型部署控制台，层级依然过深

### 3.3 视觉与交互问题

1. 虽然已有卡片、毛玻璃和主题变量，但视觉主次不清
2. 书架、章节、TTS 状态、按钮组都在争夺注意力
3. 间距系统不统一，卡片密度高，页面呼吸感不足
4. 关键动作不够明确，没有突出“继续阅读”“开始朗读”“导入新书”这类核心 CTA
5. 当前页面过于平铺，缺少“页与页”的节奏变化

### 3.4 代码结构问题

1. [`ReaderShell.tsx`](/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/components/ReaderShell.tsx) 已达到 1125 行
2. [`global.css`](/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/styles/global.css) 已达到 612 行
3. 页面、状态、组件、布局、样式全部耦合在一起
4. 后续一旦继续堆功能，阅读体验和可维护性都会恶化

## 4. 改造目标

### 4.1 产品目标

将应用重构为一个更像“真实消费级桌面阅读产品”的应用，满足：

- 进入应用先看到书和阅读，而不是模型
- 一键进入上次阅读内容
- 一键开始朗读整章
- 复杂配置收纳到设置页
- 离线能力保留，但不强迫所有用户先理解本地部署

### 4.2 体验目标

- 视觉更干净，有品牌感，有消费级质感
- 页面层级更清楚，导航更直觉
- 阅读页更沉浸，设置页更规整
- 朗读相关状态更“产品化”，而不是“工程状态台”

### 4.3 工程目标

- 拆掉单体 `ReaderShell`
- 引入正式路由或页面状态层
- 将页面、布局、域组件、状态存储拆开
- 为后续继续做书库、阅读器、播放器、设置中心留下扩展空间

## 5. 新的产品信息架构

## 5.1 一级页面

建议将应用调整为 4 个一级页面：

1. **书库**
   - 用户默认进入页
   - 展示最近阅读、最近导入、书籍网格、快速导入
2. **书籍详情**
   - 承接某一本书的封面、简介、章节、进度、朗读入口
3. **阅读器**
   - 专注阅读与播放控制
   - 只保留与当前阅读直接相关的信息
4. **设置**
   - 所有配置项集中管理
   - 离线模型与模型管理降级为设置页内二级页

### 5.2 二级页面结构

建议路由或页面状态树如下：

```text
/library
/book/:bookId
/reader/:bookId/:chapterId
/settings/tts
/settings/reading
/settings/offline
/settings/data
/settings/about
```

如果短期不引入完整路由，也至少要用“页面枚举 + 二级 tab”模拟出这套结构，而不是继续只保留 `reader/settings` 两个视图。

### 5.3 全局固定区域

建议保留 3 个全局固定层：

1. **App Shell 左侧导航**
   - 书库
   - 当前阅读
   - 设置
2. **顶部上下文栏**
   - 当前页面标题
   - 搜索 / 导入 / 返回等操作
3. **底部播放器 Dock**
   - 播放状态
   - 播放 / 暂停 / 继续
   - 当前音色
   - 当前章节

这样“播放器”不必在阅读页和设置页重复出现。

## 6. 页面规划

### 6.1 书库页 `Library`

这是新的默认首页，目标是建立“用户一进来就知道做什么”的主路径。

建议包含以下区块：

1. **欢迎区 / Hero**
   - 今日继续阅读
   - 最近一次朗读状态
   - 主按钮：`继续阅读`
   - 次按钮：`导入新书`
2. **最近阅读**
   - 1 到 3 本卡片
   - 显示阅读进度、最近章节、最近收听时间
3. **我的书库**
   - 书籍网格
   - 支持按最近导入 / 最近阅读 / 标题排序
4. **空状态**
   - 强调导入 TXT
   - 后续预留 EPUB / PDF / MD

页面目标：

- 先让用户看到“书”
- 再看到“从哪里继续”
- 最后才是设置与高级能力

### 6.2 书籍详情页 `Book Detail`

当前“书架 + 章节列表 + 操作按钮”应拆成一本书自己的详情页，而不是永远挂在左侧边栏里。

建议区块：

1. **顶部信息区**
   - 书名
   - 作者 / 文件格式 / 编码 / 大小
   - 最近阅读进度
2. **主操作区**
   - `继续阅读`
   - `从当前章节开始朗读`
   - `切换朗读音色`
3. **章节列表**
   - 当前章节高亮
   - 最近阅读位置提示
4. **书籍工具区**
   - 删除书籍
   - 重新导入
   - 清理缓存

页面价值：

- 把“对一本书的操作”从书库和阅读器里解耦出来
- 降低阅读页承载的信息量

### 6.3 阅读器页 `Reader`

阅读器应该成为最沉浸的一页，不再承担设置中心和开发控制台职责。

建议结构：

1. **顶部极简栏**
   - 返回书籍详情
   - 当前章节标题
   - 朗读按钮
   - 目录按钮
2. **正文阅读区**
   - 居中、留白充足
   - 保证长文本可持续阅读
3. **右侧抽屉或滑出层**
   - 章节目录
   - 当前书朗读设置速览
   - 当前章播放状态
4. **底部播放器 Dock**
   - 常驻，不侵入正文

阅读器只保留 3 类内容：

- 当前在读的书
- 当前在读的章节
- 当前正在播放的状态

不应该再在阅读页里出现大面积模型部署、任务历史、离线控制台。

### 6.4 设置页 `Settings`

设置页要改成真正的二级导航页，不要继续作为一个把所有卡片堆在一起的大面板。

建议拆为 5 个二级页：

#### A. `设置 / 朗读`

面向普通用户最常用：

- 默认朗读模式
- 默认云端语音
- 默认音色
- 默认语速
- 试听入口
- 网络异常时是否自动降级本地

#### B. `设置 / 阅读`

- 字号
- 行高
- 页边距
- 主题
- 段间距
- 是否显示章节浮层

#### C. `设置 / 离线与模型`

面向高级用户：

- 是否启用离线兜底
- 离线模型状态
- 离线服务健康检查
- 模型管理 / 部署控制台
- 手动导入模型

这里才放当前的 [`ModelManagementPanel.tsx`](/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/components/ModelManagementPanel.tsx)。

#### D. `设置 / 数据与缓存`

- 播放缓存占用
- 草稿队列
- 清理缓存
- 清理已删除书籍残留

#### E. `设置 / 关于`

- 版本号
- 当前支持格式
- 隐私说明
- TTS 服务说明

## 7. TTS 策略重构

## 7.1 产品级策略

新的朗读策略建议定义为 3 种模式：

| 模式 | 默认 Provider | 使用场景 | 用户感知 |
|------|---------------|----------|----------|
| 标准模式 | 云端 TTS | 日常整章、长文本、连续朗读 | 最省心，默认推荐 |
| 隐私模式 | 本地轻量 TTS / 系统 TTS | 用户不希望上传文本 | 速度优先，效果次级 |
| 角色模式 | 本地角色声线模型 | 对话型、角色化、克隆声音 | 仅高级用户需要 |

默认面向 C 端用户时，首页和阅读页只强调：

- `标准模式（推荐）`
- `隐私模式`

角色模式不作为默认主入口。

### 7.2 默认策略

建议默认规则如下：

1. 长文本朗读默认使用云端 TTS
2. 连续整章朗读默认使用云端 TTS
3. 若检测到无网或云端不可用：
   - 已开启离线兜底且本地模型可用，则自动降级到本地轻量模型
   - 否则提示切换到系统朗读或稍后重试
4. 若用户手动开启隐私模式，则强制不走云端
5. 若用户进入角色声线相关功能，则优先使用本地角色模型

### 7.3 设置文案建议

当前设置不要再让普通用户直接理解“CosyVoice / GPT-SoVITS / 健康检查 / 启动模式 / baseUrl”。

建议文案分层：

#### 普通层文案

- 默认朗读方式：`标准推荐` / `隐私优先`
- 网络不可用时：`自动切换离线朗读`
- 角色配音：`高级功能`

#### 高级层文案

- 云端 Provider
- 本地引擎状态
- 离线模型部署
- 手动导入模型目录

### 7.4 类型层建议

建议后续在 [`src/shared/types.ts`](/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/shared/types.ts) 中补充以下概念：

- `TtsStrategyMode = 'standard' | 'privacy' | 'role'`
- `fallbackPolicy = 'auto-local' | 'manual-only' | 'system-only'`
- `preferredRemoteProviderId`
- `preferredLocalProviderId`
- `offlineFallbackEnabled`

这样前端不必再直接把“Provider 选择”暴露为唯一抽象。

## 8. 视觉改造方向

## 8.1 整体风格

建议从当前“偏开发工具玻璃面板”转向“阅读器 + 电台播放器”的消费级视觉方向。

推荐主题关键词：

- 墨色
- 纸感
- 柔和背光
- 书封面卡片
- 低噪点的播放器控制

### 8.2 配色建议

避免继续使用偏紫的默认高亮，建议切换为：

- 主背景：深墨蓝 / 暖灰黑
- 卡片背景：半透明烟灰 / 暖纸白
- 强调色：铜金 / 雾蓝 / 深青
- 危险色：柔和砖红

建议默认提供 3 套主题：

1. **夜读墨蓝**
2. **暖纸米白**
3. **雾灰极简**

### 8.3 字体建议

为避免继续使用过于模板化的 `Inter` 风格：

- UI 字体建议：`HarmonyOS Sans SC` 或 `MiSans`
- 正文字体建议：`Source Han Serif SC` / `思源宋体`

阅读正文和控制界面使用不同字体，可以明显提升产品感。

### 8.4 布局原则

1. 常规页面使用 `App Shell + Content`
2. 阅读页使用更沉浸的宽内容布局
3. 卡片之间增加呼吸感，不再把所有信息塞进同一屏
4. 弱化永久右侧信息堆叠，改为抽屉、二级页或底部 Dock

### 8.5 动效建议

只做少量但有意义的动效：

1. 书库卡片淡入上浮
2. 页面切换轻微位移动画
3. 播放状态条平滑过渡
4. 阅读目录抽屉滑出

不要做花哨微动效，更不要让播放器状态像监控面板一样跳动。

## 9. 前端结构重构方案

## 9.1 推荐目录结构

建议将 renderer 拆为如下结构：

```text
src/renderer/
  app/
    AppShell.tsx
    routes.tsx
  pages/
    library/LibraryPage.tsx
    book/BookDetailPage.tsx
    reader/ReaderPage.tsx
    settings/
      SettingsLayout.tsx
      TtsSettingsPage.tsx
      ReadingSettingsPage.tsx
      OfflineSettingsPage.tsx
      DataSettingsPage.tsx
      AboutPage.tsx
  components/
    navigation/SidebarNav.tsx
    player/PlayerDock.tsx
    library/BookCard.tsx
    library/ContinueReadingCard.tsx
    book/ChapterList.tsx
    reader/ReaderContent.tsx
    reader/ReaderToolbar.tsx
    reader/ChapterDrawer.tsx
    settings/TtsModeCard.tsx
    settings/OfflinePanel.tsx
  hooks/
    useLibraryState.ts
    useReaderState.ts
    usePlaybackState.ts
    useSettingsState.ts
  styles/
    tokens.css
    layout.css
    library.css
    reader.css
    settings.css
```

### 9.2 对现有文件的拆分映射

建议将 [`ReaderShell.tsx`](/Users/baymax/.openclaw/workspace-taizi/ai-novel-reader-desktop/src/renderer/components/ReaderShell.tsx) 中的内容拆分为：

1. **AppShell**
   - 全局导航
   - 页面标题
   - 全局导入入口
2. **LibraryPage**
   - 当前书架展示
   - 最近阅读
3. **BookDetailPage**
   - 某一本书的元信息和章节列表
4. **ReaderPage**
   - 正文渲染
   - 阅读位置保存
   - 当前章朗读
5. **Settings 子页**
   - 默认 TTS
   - 阅读样式
   - 离线设置
   - 数据缓存

### 9.3 状态边界建议

当前 `persistedState`、`book`、`chapter`、`ttsState`、`offline console` 等状态都放在同一个组件中，建议拆成 4 个域：

1. **Library Domain**
   - bookshelf
   - recentBookId
   - 删除 / 导入 / 书籍元信息
2. **Reader Domain**
   - 当前书
   - 当前章节
   - 阅读滚动位置
3. **Playback Domain**
   - 播放状态
   - 当前 Provider
   - 队列、缓存、播放控制
4. **Settings Domain**
   - 默认 TTS 策略
   - 阅读样式
   - 离线开关
   - 高级配置

### 9.4 路由建议

由于当前项目未引入路由依赖，建议新增 `react-router-dom`，原因如下：

1. 书库、书籍详情、阅读器、设置天然是页面结构
2. 后续 Electron 深链接、恢复上次页面、打开指定章节都会更容易
3. 能把“页面切换”和“局部 tab 切换”彻底分开

如果第一阶段不想立刻引路由，也至少要先创建：

- `currentPage`
- `selectedBookId`
- `selectedSettingsTab`

并按页面组件化拆开，避免继续在 `ReaderShell` 里堆条件渲染。

## 10. 功能迁移映射

| 现有功能 | 现有位置 | 目标位置 |
|----------|----------|----------|
| 书架列表 | 左侧 sidebar | 书库页主区 |
| 章节列表 | 左侧 sidebar | 书籍详情页 / 阅读页目录抽屉 |
| 导入 TXT | 阅读头部按钮 | 顶部全局按钮 + 书库空状态按钮 |
| 开始自动续播 | 阅读头部按钮 | 阅读页主 CTA + 书籍详情主 CTA |
| 默认 Provider / Voice / Speed | 设置中心卡片 | `设置 / 朗读` |
| 阅读样式 | 设置中心卡片 | `设置 / 阅读` |
| 缓存与草稿队列 | 设置中心卡片 | `设置 / 数据与缓存` |
| 模型管理控制台 | 设置页大卡片 | `设置 / 离线与模型` 二级页 |
| 播放状态 | 阅读侧栏 + 设置页底部 | 底部全局播放器 Dock + 阅读页精简状态 |

## 11. 逐步执行任务清单

这一节不再只给阶段方向，而是给出可直接执行的任务序列。要求是：

1. **严格按顺序执行**
2. **每完成一步后，必须先做回归检查**
3. **每完成一步后，必须明确下一步任务**
4. **每完成一步后，必须单独提交 commit 并推送远程**

### Step 0：基线整理与文档口径统一

目标：

- 固定本轮改造范围
- 明确“云端主朗读，本地离线兜底”的唯一口径
- 避免旧文档继续误导开发

执行内容：

1. 保留本文件作为主执行文档
2. 更新 README / PRD / ARCHITECTURE 中与“离线主路线”冲突的描述
3. 在文档中统一一级页面、二级设置页和 TTS 策略命名

涉及文件：

- `README.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/C-END-REFACTOR-PLAN.md`

完成标准：

- 项目主文档不再出现“离线 TTS 是默认主链路”的表述
- 所有人看到的默认策略都是“云端优先，本地兜底”

完成后下一步：

- 进入 **Step 1：App Shell 与路由骨架**

建议 commit：

```bash
git add README.md docs/PRD.md docs/ARCHITECTURE.md docs/C-END-REFACTOR-PLAN.md
git commit -m "docs: align product direction to cloud-first tts"
git push origin HEAD
```

### Step 1：App Shell 与路由骨架

目标：

- 把应用从单一 `ReaderShell` 视图切换，升级成真正的页面结构

执行内容：

1. 引入 `react-router-dom`
2. 新建 `AppShell`
3. 实现一级页面路由：
   - `/library`
   - `/book/:bookId`
   - `/reader/:bookId/:chapterId`
   - `/settings/*`
4. 将现有 `App.tsx` 改为路由入口
5. 保留旧逻辑可复用，但不再继续向 `ReaderShell` 塞新结构

涉及文件：

- `package.json`
- `src/renderer/App.tsx`
- `src/renderer/app/AppShell.tsx`
- `src/renderer/app/routes.tsx`
- 新增 `src/renderer/pages/*`

完成标准：

- 应用启动后能进入书库页
- 顶部栏和左侧导航已存在
- 路由切换不报错

完成后下一步：

- 进入 **Step 2：书库页重构**

建议 commit：

```bash
git add package.json src/renderer/App.tsx src/renderer/app src/renderer/pages
git commit -m "feat(renderer): introduce app shell and route skeleton"
git push origin HEAD
```

### Step 2：书库页重构

目标：

- 让用户默认先看到“书”和“继续阅读”

执行内容：

1. 新建 `LibraryPage`
2. 从现有书架逻辑中抽取：
   - 书架列表
   - 最近阅读
   - 导入入口
   - 删除入口
3. 改造为空状态与卡片化布局
4. 将点击书籍跳转到书籍详情页，而不是只在侧栏切换

涉及文件：

- `src/renderer/pages/library/LibraryPage.tsx`
- `src/renderer/components/library/*`
- 与书架状态相关的 hooks / state 文件

完成标准：

- 应用默认进入书库页
- 用户可以在书库页导入、查看、删除书籍
- 点击一本书能进入详情页

完成后下一步：

- 进入 **Step 3：书籍详情页重构**

建议 commit：

```bash
git add src/renderer/pages/library src/renderer/components/library src/renderer/hooks src/renderer/styles
git commit -m "feat(renderer): add consumer-facing library page"
git push origin HEAD
```

### Step 3：书籍详情页重构

目标：

- 把“对一本书的操作”从左侧边栏中解耦出来

执行内容：

1. 新建 `BookDetailPage`
2. 展示书籍元信息、阅读进度和主操作按钮
3. 迁移章节列表到详情页
4. 提供：
   - 继续阅读
   - 从当前章节开始朗读
   - 删除书籍
   - 清理缓存

涉及文件：

- `src/renderer/pages/book/BookDetailPage.tsx`
- `src/renderer/components/book/*`
- 与当前选书逻辑相关状态

完成标准：

- 书籍详情页可完整承接某一本书的主信息与章节导航
- 左侧全局导航不再直接塞完整章节列表

完成后下一步：

- 进入 **Step 4：阅读器页重构**

建议 commit：

```bash
git add src/renderer/pages/book src/renderer/components/book src/renderer/hooks src/renderer/styles
git commit -m "feat(renderer): add book detail workflow"
git push origin HEAD
```

### Step 4：阅读器页重构

目标：

- 让阅读页回到“沉浸阅读 + 当前章朗读”的单一职责

执行内容：

1. 新建 `ReaderPage`
2. 拆出正文渲染组件
3. 将章节目录改为抽屉或侧滑层
4. 保留阅读滚动位置保存逻辑
5. 将“开始朗读当前章”保留为阅读页主 CTA

涉及文件：

- `src/renderer/pages/reader/ReaderPage.tsx`
- `src/renderer/components/reader/*`
- 当前位置、章节选择、正文滚动相关逻辑

完成标准：

- 阅读页不再出现设置大卡片与模型控制台
- 阅读页只保留阅读、章节、播放相关内容

完成后下一步：

- 进入 **Step 5：全局播放器 Dock**

建议 commit：

```bash
git add src/renderer/pages/reader src/renderer/components/reader src/renderer/hooks src/renderer/styles
git commit -m "feat(renderer): rebuild immersive reader page"
git push origin HEAD
```

### Step 5：全局播放器 Dock

目标：

- 统一播放入口和状态展示，避免阅读页与设置页重复显示播放器信息

执行内容：

1. 新建 `PlayerDock`
2. 迁移当前播放状态、暂停、继续、停止、当前章节等信息
3. 让 Dock 在书库、详情、阅读、设置页中保持一致
4. 区分：
   - 产品化主状态
   - 高级调试状态

涉及文件：

- `src/renderer/components/player/PlayerDock.tsx`
- `src/renderer/lib/playback-events.ts`
- 播放相关 hooks / state

完成标准：

- 应用所有一级页面共享同一个播放层
- 设置页不再单独展示一份重复的大状态面板

完成后下一步：

- 进入 **Step 6：设置中心拆分**

建议 commit：

```bash
git add src/renderer/components/player src/renderer/lib/playback-events.ts src/renderer/hooks src/renderer/styles
git commit -m "feat(renderer): add shared player dock"
git push origin HEAD
```

### Step 6：设置中心拆分

目标：

- 把设置从单个大面板改造成二级页面结构

执行内容：

1. 新建 `SettingsLayout`
2. 拆分 5 个子页：
   - `TtsSettingsPage`
   - `ReadingSettingsPage`
   - `OfflineSettingsPage`
   - `DataSettingsPage`
   - `AboutPage`
3. 将当前设置逻辑分别迁移到对应页面
4. 将 `ModelManagementPanel` 迁到 `离线与模型`

涉及文件：

- `src/renderer/pages/settings/*`
- `src/renderer/components/settings/*`
- `src/renderer/components/ModelManagementPanel.tsx`

完成标准：

- 设置页有左侧或顶部二级导航
- 普通用户常用设置与高级离线设置已分层

完成后下一步：

- 进入 **Step 7：TTS 策略落地**

建议 commit：

```bash
git add src/renderer/pages/settings src/renderer/components/settings src/renderer/components/ModelManagementPanel.tsx src/renderer/styles
git commit -m "feat(renderer): split settings into focused subpages"
git push origin HEAD
```

### Step 7：TTS 策略落地

目标：

- 将“云端优先，本地兜底”从文档概念变成真实设置与调用策略

执行内容：

1. 在共享类型中新增策略字段
2. 在设置页中暴露：
   - 标准模式
   - 隐私模式
   - 角色模式
3. 区分远程首选 Provider 与本地兜底 Provider
4. 为播放请求补充 fallback 规则
5. 将本地模型文案降级为高级能力

涉及文件：

- `src/shared/types.ts`
- `src/main/services/playback-service.ts`
- `src/main/services/tts-catalog-service.ts`
- `src/renderer/pages/settings/TtsSettingsPage.tsx`

完成标准：

- 默认设置明确使用云端 Provider
- 无网或云端失败时能按策略降级
- UI 文案不再暗示离线模型是默认主路径

完成后下一步：

- 进入 **Step 8：视觉系统与样式拆分**

建议 commit：

```bash
git add src/shared/types.ts src/main/services/playback-service.ts src/main/services/tts-catalog-service.ts src/renderer/pages/settings/TtsSettingsPage.tsx
git commit -m "feat(tts): implement cloud-first playback strategy"
git push origin HEAD
```

### Step 8：视觉系统与样式拆分

目标：

- 从临时堆叠样式升级为可维护的视觉系统

执行内容：

1. 拆分 `global.css`
2. 新建 `tokens.css`
3. 按页面拆样式：
   - `layout.css`
   - `library.css`
   - `reader.css`
   - `settings.css`
4. 统一卡片、按钮、标签、Badge、Dock、抽屉样式
5. 调整默认配色，去掉紫色偏向

涉及文件：

- `src/renderer/styles/global.css`
- `src/renderer/styles/tokens.css`
- `src/renderer/styles/layout.css`
- `src/renderer/styles/library.css`
- `src/renderer/styles/reader.css`
- `src/renderer/styles/settings.css`

完成标准：

- 页面层级更清晰
- 主次 CTA 明显
- 书库、阅读器、设置页拥有统一但不单调的视觉语言

完成后下一步：

- 进入 **Step 9：收尾验证与旧代码清理**

建议 commit：

```bash
git add src/renderer/styles
git commit -m "refactor(ui): introduce consumer-facing design system"
git push origin HEAD
```

### Step 9：收尾验证与旧代码清理

目标：

- 清理旧实现残留，确保新结构稳定

执行内容：

1. 删除或降级旧 `ReaderShell` 中已迁移逻辑
2. 清理无效条件渲染与废弃 CSS
3. 补齐关键链路测试：
   - 导入书籍
   - 进入详情页
   - 进入阅读页
   - 开始朗读
   - 保存设置
4. 更新文档索引

涉及文件：

- `src/renderer/components/ReaderShell.tsx`
- `src/renderer/styles/global.css`
- `src/test/*`
- `README.md`

完成标准：

- 主流程回归通过
- 旧的单体结构不再作为主入口
- 文档与代码一致

完成后下一步：

- 进入 **Step 10：发版准备**

建议 commit：

```bash
git add src/renderer/components/ReaderShell.tsx src/renderer/styles/global.css src/test README.md
git commit -m "refactor(renderer): remove legacy shell coupling"
git push origin HEAD
```

### Step 10：发版准备

目标：

- 形成一个可以对外演示或继续迭代的稳定版本

执行内容：

1. 运行 `npm run typecheck`
2. 运行 `npm run build`
3. 运行 `npm test`
4. 整理变更说明
5. 标记演示重点和已知风险

完成标准：

- 构建可通过
- 关键链路可演示
- 文档、代码、提交记录一致

完成后下一步：

- 进入下一轮增强需求，而不是继续做结构性重构

建议 commit：

```bash
git add .
git commit -m "chore(release): finalize consumer app refactor baseline"
git push origin HEAD
```

## 12. 每一步的固定交付规则

从 Step 1 开始，每一步都必须遵守下面的交付格式：

### 12.1 步骤完成汇报模板

每完成一步，都输出：

1. 本步完成内容
2. 影响文件
3. 验证结果
4. 风险或遗留项
5. **下一步任务**

建议格式：

```text
Step X 完成
- 完成内容：...
- 验证结果：...
- 风险：...
- 下一步：Step X+1 ...
```

### 12.2 Git 提交规则

每一步只提交本步骤相关改动，不混入其他阶段。

规则：

1. 一个步骤一个 commit
2. commit message 必须可读
3. 完成 commit 后立即 push
4. 若当前工作树含用户未完成改动，只暂存本步骤文件

建议命令模板：

```bash
git add <本步骤相关文件>
git commit -m "<type>(scope): <summary>"
git push origin HEAD
```

### 12.3 远程提交规则

如果当前分支是临时分支，建议使用 `codex/` 前缀，例如：

```bash
git checkout -b codex/c-end-refactor
git push -u origin codex/c-end-refactor
```

如果已经在目标分支上推进，则直接：

```bash
git push origin HEAD
```

## 13. 验收标准

完成本轮重构后，至少应满足：

1. 用户进入应用默认看到书库，而不是复杂设置
2. 用户能从书库进入书籍详情，再进入阅读页
3. 阅读页不再承载设置中心和模型部署台
4. 设置页有清晰的二级导航
5. 默认朗读策略明确为“云端优先，本地兜底”
6. 离线模型相关能力只在高级设置中出现
7. `ReaderShell` 被实质拆分，不再继续膨胀
8. `global.css` 被拆成按页面和 token 管理的样式结构
9. 每个执行步骤都有独立 commit 和远程提交记录

## 14. 结论

这次重构的本质，不是“把页面做漂亮一点”，而是把产品心智从：

- 模型与控制台驱动

转成：

- 书籍、阅读、朗读驱动

同时把 TTS 路线从：

- 离线主链路

转成：

- 云端主朗读，本地轻量兜底

只要这个方向成立，后续书库、阅读器、设置中心、播放器的结构都会变得清晰，产品也会更接近真正可交付给 C 端用户的状态。
