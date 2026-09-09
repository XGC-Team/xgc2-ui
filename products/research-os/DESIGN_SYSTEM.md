# Research OS UI foundations

以用户提供的 Atlas 设计师方案为唯一视觉基准。真实功能接入必须保留该方案的顶栏、分组侧栏、画布、节点、侧边属性面板、留白和黑白层级；不得搬回旧 Research 页面布局，也不得以“组件化”为由重做外壳。共用组件入口：`src/design-system/index.ts`；兼容现有页面的 `src/components/ui.tsx` 导入。全局样式为 `src/index.css`，应用根节点使用 `MotionConfig reducedMotion="user"`。当前为源码级基础库，尚未作为独立 npm 包发布。

启动现有 Vite 项目后访问 `/?ui-kit`，查看组件、深浅主题及运行/提醒状态；此入口不加入工作台业务导航。

| 层级 | 规格 | 使用场景 |
| --- | --- | --- |
| 全局顶栏 | 48px | 品牌、全局搜索、工作区操作 |
| 面板头/工具行 | 40px | PanelHeader / ui-toolbar |
| 控件 | xs 24 / sm 28 / md 32px | 紧凑行内 / 工具条 / 搜索输入 |
| 标签 | 88px 宽；line 40 / pill 28px 高 | 面板导航 / 局部视图切换 |
| 字体 | caption 10.5 / secondary 11.5 / body 12.5 / title 13.5px | 注释 / 次要 / 正文 / 标题 |
| 间距与圆角 | 面板间距 12；控件圆角 6；卡片圆角 8px | 用统一变量维护 |

新增页面优先组合 Card、PanelHeader、Button、IconBtn、Tabs、Badge、SoftBadge、SearchTrigger 等组件。页面不要覆写共用控件高度/标签宽度；图谱节点和嵌入网页内容可保留领域尺寸。长标签应使用简短可读名称；窄容器允许横向滚动，标签键盘方向键及 Home/End 会滚动到选中项。

外壳保留设计师的 264px 左栏、396px 可展开材料栏及可拖动分隔线。Workflow 使用原方案的点阵画布、浮动工具条、节点、贝塞尔依赖线和右侧属性编辑；Chat 在同一外壳内承载共享原生会话。

黑色（深色主题中反转为浅色）表达主操作与高优先级提醒；不为所有黑色元素添加循环动画。普通主按钮只在交互时扫光；`loading` 表示实际执行中，显示运行指示并默认禁用重复提交。只有仍可取消/停止的操作使用 `busyAction`，并提供 Stop 文案。`pulse` 仅用于需要用户处理的提醒，处理后应移除。选中标签用共享位置动画表示切换。状态必须有文字或图标，不能只凭灰度或动效区分。

CSS 动效及 Framer Motion 遵循系统减少动效设置。`ui-inverse` 为深色工具区提供局部颜色变量。只有真实请求需要处理时才显示持续提醒；Workflow 审批提醒由原生回执的 awaiting-input 状态驱动。

应用导航包含 Chat、Workflow、Graph、Knowledge、Files，供应者配置从侧栏底部 Settings 进入。旧模拟数据、假终端和占位业务控件已从应用源码移除。`/?ui-kit` 仅作为组件文档入口，不加入产品导航。

Chat 复用共享 NativeConversation 和真实事件流；Workflow 通过 Research 服务保存不可变版本、精确摘要批准、原生执行/取消及回执。Graph 复用设计者的力导向画布，读取 academic 仓库 memory 根目录、now、ontology 的核心知识和真实 Markdown / Wiki 链接；不依赖项目选择。原始资料与 OCR 缓存尚不在此视图范围内。Files 当前提供按目录分页读取及原文引用；Knowledge 提供现有笔记读取和向当前项目保存阅读笔记。底栏通过真实 PTY 提供交互终端，并用主题变量匹配浅／深色；浏览器右栏提供实际 iframe 地址加载与 5174 地面站入口。未实现的写作、浏览器自动化等业务不能通过空壳菜单占位。
