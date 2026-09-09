// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
  buildElementSelector,
  buildLandAndReclaimPrompt,
  buildMarkPrompt,
  buildStableSelector,
  clampFloatingBoxToViewport,
  findAnnotatableCandidates,
  queryAnnotationTarget,
} from './markPromptHelpers';
import type { DevAnnotation } from './markPromptHelpers';

describe('mark prompt selector and viewport helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => []),
    });
  });

  it('uses the precise unique stable selector and preserves the right repeated control', () => {
    const host = document.createElement('div');
    const left = document.createElement('button');
    const right = document.createElement('button');
    left.setAttribute('data-xgc-role', 'robot-action');
    right.setAttribute('data-xgc-role', 'robot-action');
    host.append(left, right);
    document.body.append(host);

    const stableSelector = buildStableSelector(right);
    const selector = buildElementSelector(right);
    const annotation: DevAnnotation = {
      id: 'mark-right',
      page: 'Robot assets',
      text: 'Inspect right action',
      selector,
      stableSelector: '[data-xgc-role="robot-action"]',
      semanticPath: 'page=Robot assets > role=robot-action',
      elementLabel: 'Right action',
      elementTag: 'button',
      anchorX: 0.5,
      anchorY: 0.5,
      x: 0,
      y: 0,
    };

    expect(stableSelector).toBe('');
    expect(document.querySelector(selector)).toBe(right);
    expect(queryAnnotationTarget(annotation)).toBe(right);
  });

  it('does not fall back to an anonymous outer container when no candidate is under the pointer', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.append(inner);
    document.body.append(outer);
    vi.mocked(document.elementsFromPoint).mockReturnValue([inner]);

    expect(findAnnotatableCandidates(12, 18)).toEqual([]);
  });

  it('locks a description leaf instead of the catalog row main cluster', () => {
    const main = document.createElement('div');
    main.setAttribute('data-xgc-role', 'list-page-item-main');
    main.setAttribute('data-xgc-id', 'automation-a');
    const description = document.createElement('span');
    description.className = 'xgc-list-item-subtitle';
    description.setAttribute('data-xgc-role', 'automation-row-description');
    description.setAttribute('data-xgc-id', 'automation-a');
    description.textContent = 'Records one copy of the encoded camera stream';
    main.append(description);
    document.body.append(main);
    vi.mocked(document.elementsFromPoint).mockReturnValue([description]);

    expect(findAnnotatableCandidates(8, 12)[0]).toBe(description);
    expect(buildStableSelector(description))
      .toBe('[data-xgc-role="automation-row-description"][data-xgc-id="automation-a"]');
  });

  it('locks a FormField label leaf instead of the field cluster', () => {
    const field = document.createElement('div');
    field.setAttribute('data-xgc-role', 'experiment-settings-description-field');
    field.setAttribute('data-xgc-id', 'exp-1');
    const label = document.createElement('label');
    label.className = 'xgc-form-field-label';
    label.setAttribute('data-xgc-role', 'experiment-settings-description-label');
    label.setAttribute('data-xgc-id', 'exp-1');
    label.textContent = 'Description';
    field.append(label);
    document.body.append(field);
    vi.mocked(document.elementsFromPoint).mockReturnValue([label]);

    expect(findAnnotatableCandidates(8, 12)[0]).toBe(label);
    expect(buildStableSelector(label))
      .toBe('[data-xgc-role="experiment-settings-description-label"][data-xgc-id="exp-1"]');
  });

  it('locks a Select trigger leaf instead of the unlabeled native button id', () => {
    const host = document.createElement('div');
    host.className = 'xgc-select-control';
    host.setAttribute('data-xgc-role', 'camera-intrinsic-validation-calibration-select');
    host.setAttribute('data-xgc-id', 'validation-1');
    const trigger = document.createElement('button');
    trigger.id = '_r_44_-control';
    trigger.className = 'xgc-select-trigger';
    trigger.setAttribute('data-xgc-role', 'camera-intrinsic-validation-calibration-select-trigger');
    trigger.setAttribute('data-xgc-id', 'validation-1');
    trigger.setAttribute('aria-label', 'Reference configuration');
    host.append(trigger);
    document.body.append(host);
    vi.mocked(document.elementsFromPoint).mockReturnValue([trigger, host]);

    expect(findAnnotatableCandidates(8, 12)[0]).toBe(trigger);
    expect(buildStableSelector(trigger))
      .toBe('[data-xgc-role="camera-intrinsic-validation-calibration-select-trigger"][data-xgc-id="validation-1"]');
    expect(buildElementSelector(trigger))
      .toBe('[data-xgc-role="camera-intrinsic-validation-calibration-select-trigger"][data-xgc-id="validation-1"]');
  });

  it('locks a comparison view leaf instead of the gallery cluster', () => {
    const gallery = document.createElement('nav');
    gallery.setAttribute('data-xgc-role', 'camera-intrinsic-validation-gallery');
    gallery.setAttribute('data-xgc-id', 'camera-intrinsic-validation');
    gallery.setAttribute('aria-label', 'Intrinsic validation images');
    const view = document.createElement('button');
    view.setAttribute('data-xgc-role', 'camera-intrinsic-validation-view');
    view.setAttribute('data-xgc-id', 'camera-intrinsic-validation:overlay_checker');
    view.textContent = 'Grid comparison';
    gallery.append(view);
    document.body.append(gallery);
    vi.mocked(document.elementsFromPoint).mockReturnValue([view, gallery]);

    expect(findAnnotatableCandidates(8, 12)[0]).toBe(view);
    expect(buildStableSelector(view))
      .toBe('[data-xgc-role="camera-intrinsic-validation-view"][data-xgc-id="camera-intrinsic-validation:overlay_checker"]');
  });

  it('keeps a unique stable selector on a real host box', () => {
    const host = document.createElement('div');
    const slot = document.createElement('span');
    slot.setAttribute('data-xgc-role', 'robot-ground-instrument-command-linear');
    slot.setAttribute('data-xgc-id', 'scout-04');
    host.append(slot);
    document.body.append(host);

    expect(buildStableSelector(slot))
      .toBe('[data-xgc-role="robot-ground-instrument-command-linear"][data-xgc-id="scout-04"]');
  });

  it('selects pitch marks that participate in hit-testing', () => {
    const hud = document.createElement('div');
    hud.setAttribute('data-xgc-role', 'robot-ground-hud');
    hud.setAttribute('data-xgc-id', 'scout-04');
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mark.setAttribute('data-xgc-role', 'robot-flight-pitch-mark');
    mark.setAttribute('data-xgc-id', 'scout-04:30');
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    mark.append(tick);
    hud.append(mark);
    document.body.append(hud);
    vi.mocked(document.elementsFromPoint).mockReturnValue([tick, mark, hud]);

    const candidates = findAnnotatableCandidates(50, 85);
    expect(candidates[0]).toBe(mark);
    expect(buildStableSelector(mark))
      .toBe('[data-xgc-role="robot-flight-pitch-mark"][data-xgc-id="scout-04:30"]');
  });

  it('does not invent hits for role hosts the pointer skipped', () => {
    const hud = document.createElement('div');
    hud.setAttribute('data-xgc-role', 'robot-ground-hud');
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mark.setAttribute('data-xgc-role', 'robot-flight-pitch-mark');
    hud.append(mark);
    document.body.append(hud);
    vi.mocked(document.elementsFromPoint).mockReturnValue([hud]);

    expect(findAnnotatableCandidates(50, 85)[0]).toBe(hud);
  });

  it('selects the labeled glyph when decorative SVG has no role', () => {
    const slot = document.createElement('span');
    slot.setAttribute('data-xgc-role', 'robot-network-indicator');
    slot.setAttribute('data-xgc-id', 'scout-04');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    slot.append(icon);
    document.body.append(slot);
    vi.mocked(document.elementsFromPoint).mockReturnValue([icon, slot]);

    expect(findAnnotatableCandidates(99, 20)[0]).toBe(slot);
  });

  it('builds a regular prompt without a type field even if stored intent is leftover', () => {
    const annotation: DevAnnotation = {
      id: 'mark-1',
      page: 'Home',
      text: '需要缩进',
      selector: 'button',
      stableSelector: '[data-xgc-role="recording-row"][data-xgc-id="clip.webm"]',
      semanticPath: 'page=Home > role=recording-row',
      elementLabel: 'clip.webm',
      elementTag: 'button',
      intent: 'layout',
      anchorX: 0.5,
      anchorY: 0.5,
      x: 10,
      y: 20,
    };
    const prompt = buildMarkPrompt([annotation], 'Home');
    expect(prompt).toContain('1. selector=[data-xgc-role="recording-row"][data-xgc-id="clip.webm"]');
    expect(prompt).toContain('change=需要缩进');
    expect(prompt).toContain('若你是总负责');
    expect(prompt).toContain('持续收敛');
    expect(prompt).toContain('不要派完一轮或落地一次就自动停手');
    expect(prompt).toContain('若改动共享基础控件');
    expect(prompt).toContain('禁止只改当前页面或 domain overlay 交差');
    expect(prompt).toContain('必须发布匹配 tag 的 tarball');
    expect(prompt).toContain('Vite alias');
    expect(prompt).toContain('未发布的内核不算落地');
    expect(prompt).toContain('先判定本次标注是否属于事故');
    expect(prompt).toContain('已禁止的魔法参数/平台 plumbing 新出现或反复回归');
    expect(prompt).toContain('catalog 摘要');
    expect(prompt).toContain('已统一的输入控件皮以孤立默认残留');
    expect(prompt).toContain('用户决策交互控件从操作者表面消失');
    expect(prompt).toContain('可标注身份缺失导致细粒度选不中控件');
    expect(prompt).toContain('页面/状态特有的控件与样式泄露到其他页');
    expect(prompt).toContain('有 header 的 framed Panel 正文相对顶栏边距孤立');
    expect(prompt).toContain('park 后 catalog 页丢掉离开时的列表/详情位置');
    expect(prompt).toContain('用户已明确删除的执行控件反复回归且后果/目标说不清');
    expect(prompt).toContain('临时插入不固定的显示内容造成操作面移位');
    expect(prompt).not.toMatch(/\btype=/);
  });

  it('builds a canned land-and-reclaim prompt that does not depend on marks', () => {
    const prompt = buildLandAndReclaimPrompt();
    expect(prompt).toContain('用户授权落地');
    expect(prompt).toContain('远程主分支');
    expect(prompt).toContain('回收所有工作者 worktree');
    expect(prompt).toContain('零兼容');
    expect(prompt).toContain('持续收敛');
    expect(prompt).toContain('不要落地一次或派完一轮就自动停手');
    expect(prompt).toContain('该发车发车');
    expect(prompt).toContain('APT 发车仅在必要时');
    expect(prompt).toContain('xgc2-apt-release');
    expect(prompt).toContain('不要 --force');
    expect(prompt).toContain('禁止 checkout / restore / reset');
    expect(prompt).not.toContain('1. selector=');
    expect(prompt).not.toMatch(/\btype=/);
  });

  it('clamps oversized floating boxes to a narrow viewport without negative coordinates', () => {
    expect(clampFloatingBoxToViewport(
      { left: -80, top: -24 },
      { width: 520, height: 240 },
      { width: 320, height: 200 },
    )).toEqual({
      left: 8,
      top: 8,
      maxWidth: 304,
      maxHeight: 184,
    });
  });
});
