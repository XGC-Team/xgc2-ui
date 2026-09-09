export type DevAnnotation = {
  id: string;
  page: string;
  text: string;
  selector: string;
  stableSelector: string;
  semanticPath: string;
  role?: string;
  elementId?: string;
  elementLabel: string;
  elementTag: string;
  intent?: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

export type ToolbarPositionPercent = {
  xPercent: number;
  yPercent: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type FloatingSize = {
  width: number;
  height: number;
};

export type BoundaryRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const pageCodeHints: Record<string, string[]> = {
  Experiments: [
    'src/domains/experiment/routes/ExperimentListPage.tsx',
    'src/domains/experiment/routes/ExperimentListRoute.tsx',
    'src/domains/experiment/dashboard/ExperimentDashboardCanvas.tsx',
  ],
  'Robot assets': [
    'src/domains/robot/RobotAssetsPage.tsx',
    'src/components/ListPage.tsx',
  ],
  机器人资产: [
    'src/domains/robot/RobotAssetsPage.tsx',
    'src/components/ListPage.tsx',
  ],
  Automations: [
    'src/domains/automation/AutomationsPage.tsx',
    'src/domains/automation/AutomationDefinitionsList.tsx',
    'src/domains/automation/automationDocumentService.ts',
  ],
  System: [
    'src/domains/host/HostSystemPageView.tsx',
    'src/domains/host/HostOverview.tsx',
    'src/domains/host/HostFilesWorkspace.tsx',
    'src/domains/host/HostRuntimeShell.tsx',
    'src/domains/host/HostServicesShell.tsx',
    'src/domains/host/systemLeaves/',
  ],
  Terminal: [
    'src/domains/terminal/TerminalPage.tsx',
    'src/features/terminal/terminalTransport.ts',
    'src/components/ListPage.tsx',
  ],
  Toolbox: [
    'src/domains/toolbox/ToolboxPage.tsx',
    'src/components/ListPage.tsx',
  ],
  Maintenance: [
    'src/domains/toolbox/ToolboxPage.tsx',
    'src/components/ListPage.tsx',
  ],
  维护: [
    'src/domains/toolbox/ToolboxPage.tsx',
    'src/components/ListPage.tsx',
  ],
  'Audit logs': [
    'src/domains/audit/AuditPage.tsx',
    'src/components/LogTablePage.tsx',
  ],
  Settings: [
    'src/domains/settings/SettingsPage.tsx',
  ],
  'Station settings': [
    'src/domains/settings/SettingsPage.tsx',
  ],
};

export function findAnnotatableElement(x: number, y: number): Element | null {
  return findAnnotatableCandidates(x, y)[0] ?? null;
}

export function findAnnotatableCandidates(x: number, y: number): Element[] {
  const elements = document.elementsFromPoint(x, y);
  const interactionBoundary = topmostModalBoundary(elements);
  const candidates = new Map<Element,{ depth: number;layerIndex: number }>();
  for (const [layerIndex,element] of elements.entries()) {
    if (!(element instanceof Element)) continue;
    if (element.closest('.dev-annotation-layer, .dev-annotation-toolbar')) continue;
    if (interactionBoundary && element !== interactionBoundary && !interactionBoundary.contains(element)) continue;
    let current: Element | null = element;
    while (current && !['HTML','BODY'].includes(current.tagName)
        && (!interactionBoundary || current === interactionBoundary || interactionBoundary.contains(current))) {
      if (isAnnotatableCandidate(current) && !candidates.has(current)) {
        candidates.set(current, { depth: elementDocumentDepth(current),layerIndex });
      }
      current = current.parentElement;
    }
  }
  const deepest = [...candidates]
    .sort((left, right) => right[1].depth - left[1].depth || left[1].layerIndex - right[1].layerIndex)[0]?.[0]
    ?? null;
  if (!deepest) return [];

  const hierarchy: Element[] = [deepest];
  let ancestor = deepest.parentElement;
  while (ancestor && !['HTML','BODY'].includes(ancestor.tagName)
      && (!interactionBoundary || ancestor === interactionBoundary || interactionBoundary.contains(ancestor))) {
    if (isAnnotatableCandidate(ancestor)) hierarchy.push(ancestor);
    ancestor = ancestor.parentElement;
  }
  return hierarchy;
}

function topmostModalBoundary(elements: Element[]): HTMLElement | null {
  for (const element of elements) {
    if (element.closest('.dev-annotation-layer, .dev-annotation-toolbar')) continue;
    const dialog = element.closest<HTMLElement>('[aria-modal="true"]');
    if (dialog) return dialog;
    const backdrop = element.closest<HTMLElement>('.xgc-drawer-backdrop, .xgc-modal-backdrop');
    return backdrop;
  }
  return null;
}

export function buildStableSelector(element: Element): string {
  // The selector and the painted marker boundary must describe the same DOM
  // node. Falling back to a stable ancestor here made a click on a small
  // control look precise while the generated prompt actually selected a much
  // wider row or panel.
  const testId = element.getAttribute('data-testid');
  if (testId) {
    const selector = `[data-testid="${cssAttributeValue(testId)}"]`;
    if (selectorTargetsOnlyElement(selector, element)) return selector;
  }
  const role = element.getAttribute('data-xgc-role');
  if (!role) return '';
  const id = element.getAttribute('data-xgc-id');
  const panelId = element.getAttribute('data-panel-id');
  const attrs = [
    role ? `[data-xgc-role="${cssAttributeValue(role)}"]` : '',
    id ? `[data-xgc-id="${cssAttributeValue(id)}"]` : '',
    panelId ? `[data-panel-id="${cssAttributeValue(panelId)}"]` : '',
  ].join('');
  return selectorTargetsOnlyElement(attrs, element) ? attrs : '';
}

export function buildElementSelector(element: Element): string {
  const stable = buildStableSelector(element);
  if (stable) return stable;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 6) {
    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    const stable = buildStableSelector(current);
    if (stable) {
      parts.unshift(stable);
      break;
    }
    const classes = Array.from(current.classList)
      .filter((item) => !item.startsWith('active') && !item.startsWith('selected'))
      .slice(0, 2)
      .map((item) => `.${cssEscape(item)}`)
      .join('');
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((child) => child.tagName === current?.tagName)
      : [];
    const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
    parts.unshift(`${current.tagName.toLowerCase()}${classes}${nth}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export function buildSemanticPath(element: Element, page: string): string {
  const stable = element.closest('[data-xgc-role]');
  const role = stable?.getAttribute('data-xgc-role') ?? null;
  const id = stable?.getAttribute('data-xgc-id') ?? null;
  const section = element.closest('section, article, .experiment-row, .xgc-panel-frame');
  const sectionLabel = section instanceof HTMLElement ? readElementLabel(section).slice(0, 80) : '';
  return [
    `page=${page}`,
    role ? `role=${role}` : '',
    id ? `id=${id}` : '',
    sectionLabel ? `section="${sectionLabel}"` : '',
  ].filter(Boolean).join(' > ');
}

export function getMarkPromptPageHints(page: string): string[] {
  return pageCodeHints[page] ?? [];
}

export type MarkPromptDeliveryKind = 'marks' | 'land';

export function buildLandAndReclaimPrompt(): string {
  return [
    '用户授权落地：把主仓与全部 nested 子仓的现有修改提交并推送到各自远程主分支，然后回收工作者 worktree / 分叉分支，避免改动丢失。不要把当前 Marker 标注当成本次任务。',
    '',
    '总负责：可能同时有多个工作者仍在开发。持续收敛（盘点、能收的先收、坏树记下、再拍），不要打断还在写的人，也不要落地一次或派完一轮就自动停手。工作者未全部停止时不要自己停；树干净且无人在写才结束。',
    '',
    '顺序：',
    '1. 盘点工作区根仓、docs、xgc2-devops，以及 devops 内有改动的 nested 产品仓。有改动才提交，不要空提交。',
    '2. 先在叶子仓提交并 push 到该仓已跟踪的 origin 主分支（master/main 以该仓 upstream 为准），再更新父仓 submodule 指针并推送，避免远端钉死旧 SHA。',
    '3. 回收所有工作者 worktree 与分叉分支：确认改动已在远端主分支后再删 worktree / 对应分支。禁止长期 fork。不要新开 worktree。',
    '',
    '硬限制：',
    '- 这是用户显式授权的 commit/push。不要开 PR。不要 --force / --force-with-lease。不要 --no-verify。不要改 git config。不要 amend 已推送历史。',
    '- 不要提交密钥、.env、credentials。',
    '- 他人未提交 dirty：禁止 checkout / restore / reset 覆盖。写权不在自己手上的文件不要收进自己的 commit。',
    '- 零兼容：新权威落地时同步删除被替代的实现、测试、别名、dual-read、compat shim。不要为假想外部用户留兼容层，也不要用过时测试迫使现行代码绕路。',
    '- 过程只写顶层 docs；不要把内部开发过程写进可能开源的产品子仓 docs 或源码注释。',
    '',
    'APT 发车仅在必要时；该发车发车：',
    '仅当生产 APT 真正消费的包源码已在远端、且需要新 live 索引时，才走 xgc2-apt-release（devops release-orchestrator，先推源再发车；日常 --product --no-downstream，bump_release_versions=false）。门过了就 dispatch execute，不要因为「这次先提交」或「下一拍再说」而跳过。纯 docs / 前端 Web / xgc2-core 等不进列车的改动不要发车。不要为换名单或配置另开独立发包。',
    '',
    '完成后回报：各仓 origin + SHA、回收了哪些 worktree/分支、是否发车及原因。未收完则说明还在收敛，不要假装收工。',
  ].join('\n');
}

export function buildMarkPrompt(
  annotations: DevAnnotation[],
  page: string,
): string {
  const pages = uniqueStrings(annotations.map((item) => item.page));
  const hints = uniqueStrings([
    ...getMarkPromptPageHints(page),
    ...pages.flatMap((item) => getMarkPromptPageHints(item)),
  ]);
  const lines = [
    '请根据 XGC 前端页面标注修改界面。',
    '',
    '项目约束：',
    '- 优先依据 stableSelector / data-xgc-role / data-xgc-id 定位，不要只按截图坐标理解。',
    '- 先检查候选 domain 文件；只有共享组件本身有问题时才修改 src/components/*。',
    '- 保持现有架构边界：页面业务逻辑留在 domain，通用组件只做展示和回调。',
    '- 若改动共享基础控件（@xgc2/ui-react / ui-tokens / ui-policy、家族 WorkflowStatusCard 等），禁止只改当前页面或 domain overlay 交差。必须发布匹配 tag 的 tarball，升级产品 manifest 与锁，再从锁重装后验收。Vite alias、改 node_modules、或只改家族源码 SHA 都只是临时预览，重建后会丢。未发布的内核不算落地。',
    '- 修改后运行相关 Vitest 和 lint。',
    '- 若你是总负责：可能同时有多个工作者在开发。持续收敛、整合、验收；不要打断还在写的人，也不要派完一轮或落地一次就自动停手。',
    '- 若修复形成可复用规约、改变现行决策或沉淀领域经验，更新顶层 docs / 对应 canonical skill；无实质知识变化则不机械写回。',
    '- 先判定本次标注是否属于事故（已禁止的魔法参数/平台 plumbing 新出现或反复回归（表单、catalog 摘要、aria、只读计数/哈希）；已统一的输入控件皮以孤立默认残留；用户决策交互控件从操作者表面消失/扭曲；可标注身份缺失导致细粒度选不中控件；页面/状态特有的控件与样式泄露到其他页；有 header 的 framed Panel 正文相对顶栏边距孤立；park 后 catalog 页丢掉离开时的列表/详情位置；用户已明确删除的执行控件反复回归且后果/目标说不清；或临时插入不固定的显示内容造成操作面移位（…ing… / Configurations changed 一类 helper））。若是，先反思哪几页知识库/Skill 没挡住复发并立事故页，再改代码。',
    '',
    pages.length > 0 ? `页面：${pages.join(' / ')}` : `页面：${page}`,
    pages.length > 0 && !pages.includes(page) ? `当前页面：${page}` : '',
    ...(hints.length > 0 ? ['候选文件：', ...hints.map((hint) => `- ${hint}`)] : []),
    '',
    '标注：',
    ...(annotations.length > 0 ? annotations.map(formatPromptAnnotation) : ['(当前没有标注)']),
  ].filter(Boolean);
  return lines.join('\n');
}

export function readElementLabel(element: Element): string {
  const aria = element.getAttribute('aria-label') ?? element.getAttribute('title');
  // Marker evidence must never copy an operator-entered field value. A stable
  // label or placeholder is sufficient to identify the control.
  const value = element instanceof HTMLInputElement ? element.placeholder : '';
  const rawText = element instanceof HTMLElement ? element.innerText : element.textContent;
  const text = rawText?.replace(/\s+/g, ' ').trim();
  return (aria || value || text || '(no text)').slice(0, 120);
}

export function safeAnnotationElementLabel(annotation: DevAnnotation): string {
  const liveTarget = queryAnnotationTarget(annotation);
  if (liveTarget) return readElementLabel(liveTarget);
  if (['input', 'textarea', 'select'].includes(annotation.elementTag.toLowerCase())) {
    return '(form control label unavailable)';
  }
  return annotation.elementLabel.slice(0, 120);
}

export function resolveAnnotationPosition(annotation: DevAnnotation, tick: number): { x: number; y: number } {
  void tick;
  const target = queryAnnotationTarget(annotation);
  if (!target) {
    return { x: annotation.x, y: annotation.y };
  }
  const rect = target.getBoundingClientRect();
  return {
    x: rect.left + rect.width * annotation.anchorX,
    y: rect.top + rect.height * annotation.anchorY,
  };
}

export function queryAnnotationTarget(annotation: DevAnnotation): Element | null {
  for (const selector of [annotation.stableSelector, annotation.selector]) {
    if (!selector) continue;
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 0) continue;
      if (selector === annotation.stableSelector && matches.length !== 1) continue;
      const target = matches[0];
      if (target instanceof Element) return target;
    } catch {
      // Invalid selectors can come from stale annotations.
    }
  }
  return null;
}

export function clamp(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : safeMin;
  return Math.min(safeMax, Math.max(safeMin, safeValue));
}

export function clipBoundaryToViewport(
  rect: BoundaryRect,
  viewport: ViewportSize,
): BoundaryRect | null {
  const left = clamp(rect.left, 0, viewport.width);
  const top = clamp(rect.top, 0, viewport.height);
  const right = clamp(rect.left + rect.width, 0, viewport.width);
  const bottom = clamp(rect.top + rect.height, 0, viewport.height);
  if (right <= left || bottom <= top) return null;
  return { left,top,width: right - left,height: bottom - top };
}

export function clampFloatingBoxToViewport(
  desired: { left: number;top: number },
  size: FloatingSize,
  viewport: ViewportSize,
  margin = 8,
): { left: number;top: number;maxWidth: number;maxHeight: number } {
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const effectiveWidth = Math.min(Math.max(0, size.width), maxWidth);
  const effectiveHeight = Math.min(Math.max(0, size.height), maxHeight);
  const maximumLeft = Math.max(margin, viewport.width - effectiveWidth - margin);
  const maximumTop = Math.max(margin, viewport.height - effectiveHeight - margin);
  return {
    left: clamp(desired.left, margin, maximumLeft),
    top: clamp(desired.top, margin, maximumTop),
    maxWidth,
    maxHeight,
  };
}

export function placeCaptionInViewport(
  anchor: BoundaryRect,
  size: FloatingSize,
  viewport: ViewportSize,
  margin = 8,
  gap = 5,
): { left: number;top: number;maxWidth: number;maxHeight: number;placement: 'above' | 'below' } {
  const aboveTop = anchor.top - gap - size.height;
  const belowTop = anchor.top + anchor.height + gap;
  const aboveFits = aboveTop >= margin;
  const belowFits = belowTop + size.height <= viewport.height - margin;
  const availableAbove = anchor.top - margin;
  const availableBelow = viewport.height - margin - (anchor.top + anchor.height);
  const placement = aboveFits || (!belowFits && availableAbove >= availableBelow) ? 'above' : 'below';
  return {
    ...clampFloatingBoxToViewport({
      left: anchor.left,
      top: placement === 'above' ? aboveTop : belowTop,
    }, size, viewport, margin),
    placement,
  };
}

export function isToolbarPosition(value: unknown): value is ToolbarPositionPercent {
  if (!value || typeof value !== 'object') return false;
  const position = value as {
    xPercent?: unknown;
    yPercent?: unknown;
  };
  return typeof position.xPercent === 'number'
    && Number.isFinite(position.xPercent)
    && typeof position.yPercent === 'number'
    && Number.isFinite(position.yPercent);
}

export function resolveToolbarPixelPosition(
  position: ToolbarPositionPercent,
  viewport: { width: number; height: number },
  toolbar: { width: number; height: number },
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewport.width - toolbar.width - margin);
  const maxY = Math.max(margin, viewport.height - toolbar.height - margin);
  return {
    x: clamp(margin + clamp(position.xPercent, 0, 1) * Math.max(0, maxX - margin), margin, maxX),
    y: clamp(margin + clamp(position.yPercent, 0, 1) * Math.max(0, maxY - margin), margin, maxY),
  };
}

export function toolbarPixelsToPercent(
  position: { x: number; y: number },
  viewport: { width: number; height: number },
  toolbar: { width: number; height: number },
  margin = 8,
): ToolbarPositionPercent {
  const maxX = Math.max(margin, viewport.width - toolbar.width - margin);
  const maxY = Math.max(margin, viewport.height - toolbar.height - margin);
  return {
    xPercent: Math.max(0, maxX - margin) > 0 ? clamp((position.x - margin) / (maxX - margin), 0, 1) : 0,
    yPercent: Math.max(0, maxY - margin) > 0 ? clamp((position.y - margin) / (maxY - margin), 0, 1) : 0,
  };
}

function elementDocumentDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current?.parentElement) {
    current = current.parentElement;
    depth += 1;
  }
  return depth;
}

function isAnnotatableCandidate(element: Element): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  try {
    return element.matches([
      '[data-xgc-role]',
      '[data-testid]',
      'button',
      'input',
      'select',
      'textarea',
      'a',
      '[data-xgc-control="button"]',
    ].join(','));
  } catch {
    return false;
  }
}

function formatPromptAnnotation(annotation: DevAnnotation, index: number) {
  const selector = annotation.stableSelector || annotation.selector || '(no selector)';
  const details = [
    `${index + 1}. selector=${selector}`,
    `target=${annotation.elementTag} "${safeAnnotationElementLabel(annotation)}"`,
    `change=${annotation.text}`,
    `path=page=${annotation.page}`,
  ];
  if (!annotation.stableSelector && annotation.semanticPath) {
    details[details.length - 1] = `path=${annotation.semanticPath}`;
  }
  return details.join('\n   ');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function cssEscape(value: string): string {
  if ('CSS' in window && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ');
}

function selectorTargetsOnlyElement(selector: string, element: Element): boolean {
  try {
    if (!element.isConnected) return true;
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}
