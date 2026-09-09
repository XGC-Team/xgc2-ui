# 原文批注与右栏验收 · 2026-09-08

- 右栏浏览器地址、阅读搜索、项目路径与编译、PDF 页码与框选共用 40px 工具栏。PDF 文件版本、缩放和原件入口在该栏“更多”中。
- paper-temp 最新 PDF：build_37ce02d79caf96737fdc62b7。保存两条真实批注：Limitations 原文、公式区域。矩形归一化后随缩放回显；点击原文上的标记打开就地详情。
- 批注 body 使用 research.pdf-anchor/v1，保存精确原文、页码、矩形和上下文；authorRef 仍绑定项目和 PDF digest，兼容历史页级批注。旧 PDF 不显示新版矩形。
- 交给聊天的草稿包含路径、构建、PDF 地址、digest、原文、归一化矩形和意见，提示查看 PDF 后定位源码。没有发送模型提示词，也没有把 PDF 坐标宣称为 SyncTeX 源码行号。
- paper-temp 原生会话实际恢复成功；没有重发原任务。断连历史 seq 126–129 明确记录服务停止/重启，恢复入口移到已有主顶栏。
- npm test：4 个 Vitest 测试通过（存储往返、非法区域、旧批注、缩放/滚动坐标）。npm run lint:review、npm run build 通过。
- 浏览器：scripts/check-pdf-inline.mjs（首次保存两条样例批注）；scripts/check-right-panel.mjs（已保存批注、版本隔离、全右栏入口、恢复空闲会话且不重发提示词）通过。

原文批注示例见 inline-region.png。知识条目是批注记录，不是嵌入 PDF 文件的墨迹；精确源码反向同步尚未接入。
