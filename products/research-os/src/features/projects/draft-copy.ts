import type { DraftField, DraftKind } from './draft-model'
type Copy = {
  title: string; create: string; name: string; kind: string; list: string; back: string; empty: string
  saved: string; saving: string; unsaved: string; fresh: string; loading: string; loadError: string; invalid: string; saveError: string; conflict: string
  save: string; retry: string; reload: string; export: string; discard: string; discardConfirm: string; closeSaving: string; closeDirty: string
  boundary: string; sources: string; sourcePath: string; sourceHelp: string; sourceInvalid: string; addSource: string; currentSource: string
  addBlock: string; blockTitle: string; up: string; down: string; remove: string; removeConfirm: string; deleteDraft: string; deleteConfirm: string
  quote: string; untitled: string; cancel: string; storage: string; draft: string
  addToContext: string; sourceToContext: string
  kinds: Record<DraftKind, string>; blocks: Record<DraftKind, string>; fields: Record<DraftField, string>
}
export const draftCopy: Record<'zh' | 'en', Copy> = {
  zh: {
    title: '项目研究对象', create: '创建草稿', name: '草稿名称', kind: '草稿类型', list: '返回草稿列表', back: '返回所属项目', empty: '还没有草稿。选择一种结构开始。',
    saved: '已保存', saving: '保存中…', unsaved: '未保存', fresh: '尚未创建文件', loading: '正在读取草稿…', loadError: '草稿读取失败。重试前不会启用编辑。', invalid: '草稿格式损坏、版本不支持或项目不匹配；未覆盖原文件。', saveError: '保存失败，本地修改仍保留。', conflict: '远端版本已变化。请导出本地副本，再决定是否丢弃本地修改并重读。',
    save: '保存', retry: '重试保存', reload: '重新读取', export: '导出本地副本', discard: '丢弃并重读', discardConfirm: '丢弃这个项目草稿文件中全部未保存修改并重新读取？建议先导出本地副本。', closeSaving: '保存请求尚未结束，暂不能关闭。请在保存完成或失败后再关闭。', closeDirty: '关闭会丢弃这个项目草稿文件中全部未保存修改。仍要关闭吗？',
    boundary: '仅编辑草稿：不生成论文或视频、不启动工作流、订阅、调度或仿真。', sources: '依据文件', sourcePath: '项目内相对文件路径', sourceHelp: '保存文件引用，不复制内容；打开的是当前文件，不是历史快照。存在性在打开时检查。', sourceInvalid: '请输入有效的项目内相对路径，不包含 ..、空目录段或反斜杠。', addSource: '关联文件', currentSource: '打开当前文件',
    addBlock: '添加', blockTitle: '标题', up: '上移', down: '下移', remove: '删除', removeConfirm: '从草稿中删除这个条目？', deleteDraft: '删除草稿', deleteConfirm: '删除这个草稿并保存到项目？不会删除关联的依据文件。',
    quote: '加入 Chat 草稿', untitled: '未命名', cancel: '取消', storage: '保存位置', draft: '草稿 · 未执行',
    addToContext: '加入 Chat 上下文', sourceToContext: '来源加入 Chat 上下文',
    kinds: { paper: '论文结构', slides: '演示页面', storyboard: '视频分镜', workflow: '工作流定义', rule: 'RSS 规则', experiment: '实验需求', note: '来源笔记', material: '材料引用' },
    blocks: { paper: '章节', slides: '页面', storyboard: '镜头', workflow: '步骤', rule: '规则', experiment: '实验条目', note: '笔记', material: '说明' },
    fields: { observation: '阅读笔记与判断（不是已验证知识）', description: '材料说明', purpose: '写作目标', argument: '论点与内容安排', evidence: '依据与待核验项', constraints: '限制条件', message: '核心信息', visual: '视觉内容', speakerNotes: '演讲备注', narration: '旁白', duration: '时长要求', objective: '步骤目标', inputs: '输入', outputs: '预期输出', acceptance: '检查与验收条件', feed: '订阅来源', filter: '筛选条件', action: '拟采取的动作', question: '研究问题与假设', parameters: '参数与取值', measurement: '测量指标与方法' },
  },
  en: {
    title: 'Project research objects', create: 'Create draft', name: 'Draft name', kind: 'Draft type', list: 'Back to drafts', back: 'Return to owning project', empty: 'No drafts yet. Choose a structure to begin.',
    saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', fresh: 'File not created yet', loading: 'Loading drafts…', loadError: 'Could not load drafts. Editing is blocked until a successful retry.', invalid: 'Invalid format, unsupported version or mismatched project. The original file was not overwritten.', saveError: 'Save failed. Local edits are retained.', conflict: 'The remote version changed. Export your local copy before deciding to discard and reload.',
    save: 'Save', retry: 'Retry save', reload: 'Reload', export: 'Export local copy', discard: 'Discard and reload', discardConfirm: 'Discard ALL unsaved changes in this project draft file and reload? Export a local copy first.', closeSaving: 'A save is still in flight. Close this tab after the save completes or fails.', closeDirty: 'Closing discards ALL unsaved changes in this project draft file. Close anyway?',
    boundary: 'Draft editing only: no paper/video generation, workflow execution, subscription, scheduling or simulation.', sources: 'Source files', sourcePath: 'Project-relative file path', sourceHelp: 'Stores a reference, not a copy. Opens the current file, not a historical snapshot. Existence is checked when opened.', sourceInvalid: 'Use a relative file path without .., empty segments or backslashes.', addSource: 'Link file', currentSource: 'Open current file',
    addBlock: 'Add', blockTitle: 'Title', up: 'Move up', down: 'Move down', remove: 'Remove', removeConfirm: 'Remove this item from the draft?', deleteDraft: 'Delete draft', deleteConfirm: 'Delete this draft and save the change? Linked source files will not be deleted.',
    quote: 'Add to Chat draft', untitled: 'Untitled', cancel: 'Cancel', storage: 'Storage', draft: 'Draft · not executed',
    addToContext: 'Add to Chat context', sourceToContext: 'Add source to Chat context',
    kinds: { paper: 'Paper structure', slides: 'Presentation pages', storyboard: 'Video storyboard', workflow: 'Workflow definition', rule: 'RSS rule', experiment: 'Experiment requirements', note: 'Source note', material: 'Material reference' },
    blocks: { paper: 'section', slides: 'page', storyboard: 'shot', workflow: 'step', rule: 'rule', experiment: 'experiment item', note: 'note', material: 'description' },
    fields: { observation: 'Notes and interpretation (not verified knowledge)', description: 'Material description', purpose: 'Writing goal', argument: 'Argument and content', evidence: 'Evidence and checks needed', constraints: 'Constraints', message: 'Key message', visual: 'Visual content', speakerNotes: 'Speaker notes', narration: 'Narration', duration: 'Duration requirements', objective: 'Step objective', inputs: 'Inputs', outputs: 'Expected outputs', acceptance: 'Checks and acceptance criteria', feed: 'Feed source', filter: 'Filter conditions', action: 'Proposed action', question: 'Question and hypothesis', parameters: 'Parameters and values', measurement: 'Metrics and measurement method' },
  },
}
