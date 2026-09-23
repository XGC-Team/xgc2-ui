# Research OS UI foundations

2026-09-15 起以「精炼黑白 · 编辑排版」为唯一视觉基准（用户授权重设计并逐轮验收；Atlas 原稿不再是已接受基线）。与 XGC2 不共用外壳：设计哲学同源（token 驱动、可标注主机、焦点/滚动/动效纪律），视觉身份各自独立。共用组件入口：`src/design-system/index.ts`；兼容现有页面的 `src/components/ui.tsx` 导入。全局样式 `src/index.css`，应用根节点 `MotionConfig reducedMotion="user"`。

启动 Vite 后访问 `/?ui-kit` 查看组件与深浅主题；此入口不加入业务导航。

## 色彩：精炼黑白，不刻意用颜色

暖纸/石墨中性阶（`--bg-app #f4f3f1` / 深色 `#100f0e`），主操作=墨（深色反转为纸），语义状态保持灰阶——可辨性靠文字/图标/动效，不靠色。选区实底墨。强调色即墨色，`accent-soft` 为墨的 6–12%  alpha。

## 边界律：软边界 + 强留白（2026-09-15 用户验收）

- 面板分界 = **拖拽手柄线**：1px `var(--line)` 常驻，hover `ink/30`、拖拽 `ink/60`；一根线身兼边界与功能。
- 主列 header 下一根发丝规线（running head 之意）；其余壳体零线条。
- 侧栏/右栏/下栏用 `bg-panel` 与底衬形成柔和色温差读出面层。
- 卡片保留 `border-line` + `shadow-soft`；控件内、列表内、面板头不加线，靠留白分组。
- 禁止回到「每个面板四周一圈硬线」的钢筋混凝土框架；也禁止零边界的混沌。

## 结构：通栏顶栏 + 常驻 rail + 二级侧栏（2026-09-15 通栏轮）

**顶栏是一个整体，禁止左中右割裂**：`<header>` 通栏在最顶，rail 与右栏 tabs 都让出顶栏（从顶栏下沿开始）。左 = 产品标 + Research OS 衬线字标 + 语境（项目/页面）；中 = 全局搜索触发器（绝对居中，点击弹 CommandPalette，⌘K）；右 = 页操作 portal（`#workbench-page-actions`）+ 三栏开关图标。顶栏下边框通贯全宽，是唯一结构线。**产品标复用 XGC2 `xgc-brand-mark.svg` 几何**（圆角方章 + X + 十字切口，`IconMark` 承载）——同一套班子两个产品共用同一枚标，不另绘；但**用墨色版**：方章/切口 `currentColor` 随 `--ink`、X 用 `--bg-app` 镂空，深浅主题自动反转（不用品牌蓝，黑白身份无例外）。品牌标与 rail 图标**严格同轴**：rail 内容宽 47（48 减 1px 边线）→ 轴线 23.5px，header 左补 12 + 23px 居中盒。

**搜索/网址唯一入口律（2026-09-15 标注轮）**：全局搜索是搜索与网址输入的**唯一起点**——二级侧栏不再放「查找…」触发器，网页标签不再放局部地址栏（只留前进/后退/刷新）。CommandPalette 识别 URL/域名查询并给出「打开网页：host」动作（`lib/web.ts` 的 `looksLikeUrl`/`normalizeWebUrl` 是唯一归一化逻辑）；web 标签支持 `url` 载荷并按 url 去重。新增局部搜索框前，先问能否进全局搜索。

壳体单排：**48px 常驻图标 rail（顶层菜单）** + 可关二级侧栏（默认 264，对话线程与项目树）+ 主列 + 全高右栏（默认 396）。rail 选中用实测滑动墨条，tooltip 为延迟 350ms 的墨丸（`.ui-rail-btn::after`）。主列顶部唯一 40px header：衬线页名 + 页面操作（`#workbench-page-actions`）+ 三栏开关（空间顺序 左→下→右，激活态即可见性）。**主题切换只住设置页**，和界面语言同一只紧凑下拉（`ui-select-compact w-56`），不进头栏，也不再用浅色/深色胶囊。下栏默认 252，**折叠即归零、不留任何条**（内容保持挂载，终端不断连）。面板尺寸默认值与拖拽夹取集中在 `App.tsx` 的 `PANEL`。

**右栏统一法（2026-09-15，标签实例化定稿）：** 右栏 = **浏览器式内容实例标签**——每个标签是一个打开的网页/文件/PDF/笔记（`RightTab` 联合类型），标题随内容（站点 host/文件名/笔记题），可开可关；禁止按功能大类分固定页签，禁止 portal 注入工具条（`RightPanelActions` 已废）。标签条：kind 图标 + 标题 + 悬停关闭钮，激活为浅底卡片（`.ui-rtab`）；「+」新建菜单只给 web/file/note（PDF 从文件流程来）。**全部标签保持挂载**（`.rtab-panel` hidden 切换），状态不丢。每页内容区自带一致的 **36px 子工具行**（`h-9 px-2 gap-1`：导航/标题/主操作/`RightMore`）。阅读渲染主区与右栏共用 `MarkdownView`（frontmatter、wikilink、Shiki 代码）。标题上报一律 **ref 模式**（`titleRef.current?.()`），禁止把宿主内联回调写进 effect 依赖（死循环教训）。空态统一：22px 1.2 笔画图标 + 衬线标题 + 一行提示 + 可选主操作。

## 字体与排版：编辑排版（editorial）

**令牌唯一来源律（2026-09-15 事故修复）：** 字体/色彩令牌只在 `:root` 写值，`@theme inline` 里**只允许自映射**（`--font-sans: var(--font-sans)`），禁止再写直接值——同名键后写覆盖先写，曾致 `--font-sans` 被自引用静默覆盖、Inter Variable 全站失效（全站回落系统字体栈而无人察觉）。共享包（T3 composer 等）经 preflight/`font-sans` 继承同一令牌；产品侧调共享件外观只走 `.native-chat-host` overlay（如 composer 控件 12px/500、编辑器 13px/400），不改共享包源码。

- `--font-display` 衬线族（Charter / Songti SC / Noto Serif CJK）用于页名、主页问候等品牌/标题位；正文无衬线。
- 字号台阶：caption 11 / secondary 12 / body 13 / title 14 / display 24（主页问候可至 36）。
- 对话主页空态 = 书刊扉页：日期刊头（小帽字 + 短规线）、衬线问候、编号目录式起手式（01–04，悬停浮出 ↗），点击填草稿。

## 动效：编排，不装饰

- 节奏令牌：`--duration-quick 120 / fast 160 / base 220 / slow 320ms`，`--ease-standard` / `--ease-layout`。
- 指示器一律**实测定位**：Tabs 下划线与侧栏导航墨点（`ui-nav-marker`）选中切换走过渡，容器缩放直接吸附（无 transition），禁止 layoutId 在 resize 时重放 spring。
- 三栏折叠/展开用宽/高动画（240ms `ease-layout`）；**拖拽调整尺寸时动画时长归零**，不橡皮筋。
- 页面切换 `ui-surface-in` 轻微上浮淡入；空态逐行 stagger（60ms 级联）。全部尊重 `prefers-reduced-motion`。
- 禁止装饰性动效（高光扫过等）；`loading` 脉冲点表示实际执行中；`pulse` 仅用于需要用户处理的提醒。
- **图谱入场律（绽放，2026-09-15）**：首屏禁止同步预收敛（阻塞主线程的白等）。首帧即绘、力导在视野内实时收敛；节点按度数降序错峰亮起（骨架先显、叶子后绽，700ms 窗 + 450ms easeOutCubic；边随两端进度淡入、标签尾段淡入）；相机在冷却前每帧重贴合扩张中的布局（用户接管即停），热阶段每帧两 tick。点阵背景用缓存 pattern 瓦片一次填充，禁止逐点数千次 fillRect。

## 图标与控件

- **语义图标用手绘专属集**（`src/components/icons.tsx`，24 网格、圆角端点、1.75 笔画）：对话气泡、工作流贝塞尔双节点、图谱三星星座、知识摊开书、设置错位滑杆、三栏开关（圆角框+分栏线）。纯几何工具图标（+ − × › 搜索 刷新）可用 Lucide。禁止随手挑现成语义图标凑数。
- 图标 strokeWidth 统一 1.75；尺寸台阶：rail 17 / 导航 16 / 列表 15 / 线程 13 / 按钮内 11–14。
- **bar 断舍离**：工具条/页头只放操作，不放统计数字与常驻提示文字（「N 篇文档 · M 链接」、嵌入提示条之类一律删）；状态信息只在其可行动时出现。
- 控件高 xs 24 / sm 28 / md 32；圆角控件 8（`rounded-md`）、卡片/面板 12（`rounded-lg`）。
- 实底墨钮 hover 走 `--accent-hover` 浅墨；焦点环外移 2px（`.ui-control-solid`）。输入框默认细线、hover 加粗、焦点环。
- 新增页面优先组合 Card、PanelHeader、Button、IconBtn、Tabs、Badge、SoftBadge、SearchTrigger、SectionLabel；不要覆写共用控件高度/标签宽度；图谱节点和嵌入网页内容可保留领域尺寸。

## 语义与功能纪律（沿用）

黑色（深色反转）表达主操作与高优先级提醒；不为所有黑色元素添加循环动画。只有仍可取消/停止的操作使用 `busyAction` 并提供 Stop 文案。状态必须有文字或图标，不能只凭灰度或动效区分。`ui-inverse` 为深色工具区提供局部颜色变量。只有真实请求需要处理时才显示持续提醒；Workflow 审批提醒由原生回执的 awaiting-input 状态驱动。

应用导航为 Chat、Workflow、Knowledge、Settings（图谱已并入 Knowledge）。二级侧栏按页上下文化：Chat/Workflow 给线程与项目树；Knowledge 给「文件树 / 图谱」分段切换器——文件树默认折叠、选中即在主区打开阅读面，图谱模式给可检索篇目列表，点节点回阅读面。阅读面（`Reader.tsx` + `.research-document`）：720px 居中栏、衬线标题、frontmatter 元信息块、`[[wikilink]]` 可解析跳转、Shiki 双主题代码高亮（web 包 + go/rust/toml/latex 等按需注册，未知语言降级纯文本）、代码块语言标签 + 悬停复制钮。图谱画布透明透出 `--bg-app`，拖拽节点时持续 reheat 让邻点被牵引跟随；浮层不用 backdrop-blur。

Chat 复用共享 AgentConversation 和真实事件流。Workflow 画布是活体：节点状态从三阶段回执推导，当前步骤按回执正文命中标题，运行中边 `edge-flow`、当前节点呼吸描边；底部 Crew 胶囊拼装研究/审查/写作与可用工作者（点芯片再点步骤/角色槽），节点可挂 `agent` / `knowledge[]` 随计划版本持久化。执行合同仍是三个原生会话，节点级独立 session 留 Open。知识芯片打开学术笔记，思维链芯片打开项目白板。Files 按目录分页；稿件 PDF 经 SyncTeX `POST /manuscripts/build-records/{id}/synctex` 与中央 SourceStage 双向跳转（PDF→源高亮行，源→PDF 闪烁框；批注锚点可从笔记回跳）。Knowledge 二级侧栏是文件树，图谱是未选文件时的首页。底栏真实 PTY；右栏内容实例标签。未实现的业务不能通过空壳菜单占位。

## Agent 原生工作台（2026-09-24 轮）

- **讨论停靠 = 三栏写作布局**：主区标签条的三栏钮（`Columns3`）把讨论停靠为主区左侧一列，形成「讨论 | 研究画布/大纲 | 制品/PDF」三栏同时可用；停靠列宽 300–560 可拖。讨论仍是**同一个 keyed 实例**，只换 `gridArea`，草稿与消息流不重挂；停靠时讨论不再出现在标签条，`showConversation` 不再抢占主区内容标签。偏好 `research-ui-chat-dock`，命令面板可切换。
- **原生 Agent 名册**（`AgentRoster` / `agent-readiness.ts`）：只陈述宿主设置文档报告的事实——未安装 / 已停用 / 未核验登录 / 未登录 / 已登录；**禁止「在线」字样**，未核验不等于可用。实心点=已登录，空心=其余，虚线=未安装；状态以文字为准。顺序 Codex、Grok、Claude、OpenCode、Cursor。
- **无可用 Agent 时**：composer 以明确原因禁发（`agentStartBlockedReason`），研究台与项目空态给出「连接与模型」入口；不再只留一个灰色发送钮。
- **研究台扉页**取代「继续写作」：问候 + 起手式 + 原生 Agent 名册 + 项目绑定同屏；无项目即通用对话。
- **设置页**：二级侧栏=分节目录（外观、连接与模型）+ 名册；`openSettings(section)` 深链滚动到节。供应者节改名「连接与模型」，并说明凭证只在各客户端自身登录。
- **非 Chat 页主列 header**：衬线本地化页名（不再显示未翻译的英文导航键）。
- **研究画布 ≠ 工作流**：画布空态说明「外化意图/论证/证据/约束，不是模型思维链、不是执行流程」，并指向工作流；工作流空态反向指回研究画布。研究内容未建立或审阅锁定时，画布空态只说明下一步，不给看似可用的新增钮。父级视图切换（问题表/大纲/画布）存在时，画布内不再重复渲染视图切换。
- **陷阱**：`.native-chat-host` 内共享 T3 样式把 `--accent` 重定义为淡色，`variant="solid"` 钮会发白——chat host 内的产品侧按钮用 outline/ghost。
