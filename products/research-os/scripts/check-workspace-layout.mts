// Run without the app's dependencies: node --experimental-strip-types --test scripts/check-workspace-layout.mts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  activeCanvasProject, canSplitWorkspace, chatWidthForRatio, ratioForChatWidth,
  rememberCanvas, resolveWorkspaceMode, WORKSPACE_LAYOUT, MIN_SPLIT_WIDTH,
} from '../src/features/projects/workspace-layout.ts'
import { workspaceCopy } from '../src/features/projects/workspace-copy.ts'

test('split breakpoint is derived from the two minimum widths and the existing hairline', () => {
  assert.equal(MIN_SPLIT_WIDTH, 681)
  assert.equal(canSplitWorkspace(MIN_SPLIT_WIDTH - 1), false)
  assert.equal(canSplitWorkspace(MIN_SPLIT_WIDTH), true)
})
for (const width of [0, -1, NaN, Infinity, -Infinity, 390]) {
  test(`does not split an unavailable or narrow workspace: ${width}`, () => {
    assert.equal(canSplitWorkspace(width), false)
    assert.equal(resolveWorkspaceMode(width, 'split', 'canvas', true), 'canvas')
  })
}
test('no canvas always leaves the original conversation visible', () => {
  for (const requested of ['chat', 'canvas', 'split'] as const) {
    assert.equal(resolveWorkspaceMode(1600, requested, 'canvas', false), 'chat')
    assert.equal(resolveWorkspaceMode(390, requested, 'canvas', false), 'chat')
  }
})
test('wide workspaces show chat and canvas together by default', () => {
  assert.equal(resolveWorkspaceMode(900, 'split', 'canvas', true), 'split')
})
test('explicit focus choices are retained on wide screens', () => {
  assert.equal(resolveWorkspaceMode(900, 'chat', 'canvas', true), 'chat')
  assert.equal(resolveWorkspaceMode(900, 'canvas', 'chat', true), 'canvas')
})
test('compact pane selection does not overwrite the preference for split view', () => {
  assert.equal(resolveWorkspaceMode(390, 'split', 'chat', true), 'chat')
  assert.equal(resolveWorkspaceMode(390, 'split', 'canvas', true), 'canvas')
  assert.equal(resolveWorkspaceMode(900, 'split', 'chat', true), 'split')
})
test('same-project canvas is active', () => assert.equal(activeCanvasProject('paper-a', 'paper-a'), 'paper-a'))
test('foreign-project canvas is never paired with the selected conversation', () => {
  assert.equal(activeCanvasProject('paper-a', 'paper-b'), null)
})
test('global conversation cannot inherit a project canvas', () => assert.equal(activeCanvasProject('paper-a', ''), null))
test('closed canvas remains closed', () => assert.equal(activeCanvasProject(null, 'paper-a'), null))
test('opening a canvas remembers a stable project identity without mutating the list', () => {
  const before = Object.freeze(['paper-a'])
  const after = rememberCanvas(before, 'paper-b')
  assert.deepEqual(after, ['paper-a', 'paper-b'])
  assert.deepEqual(before, ['paper-a'])
})
test('reopening a project does not create another canvas instance', () => {
  const before = ['paper-a', 'paper-b']
  assert.equal(rememberCanvas(before, 'paper-a'), before)
})
test('closing a canvas does not discard its mounted identity', () => {
  const before = ['paper-a']
  assert.equal(rememberCanvas(before, null), before)
  assert.equal(rememberCanvas(before, ''), before)
})
test('minimum split width fits both panes exactly', () => {
  assert.equal(chatWidthForRatio(MIN_SPLIT_WIDTH, 0.1), WORKSPACE_LAYOUT.minChat)
  assert.equal(chatWidthForRatio(MIN_SPLIT_WIDTH, 0.9), WORKSPACE_LAYOUT.minChat)
})
test('dragging cannot shrink either pane below its minimum', () => {
  assert.equal(chatWidthForRatio(1000, -100), 320)
  assert.equal(chatWidthForRatio(1000, 100), 639)
})
test('invalid ratio falls back to the default', () => {
  assert.equal(chatWidthForRatio(1000, NaN), chatWidthForRatio(1000, WORKSPACE_LAYOUT.defaultRatio))
  assert.equal(chatWidthForRatio(1000, Infinity), chatWidthForRatio(1000, WORKSPACE_LAYOUT.defaultRatio))
})
test('narrow measurements cannot produce a negative or non-finite width', () => {
  for (const width of [-1, NaN, Infinity]) assert.equal(chatWidthForRatio(width, 0.5), 0)
  assert.equal(chatWidthForRatio(390, 0.5), 390)
})
test('pixel adjustment round-trips through the stored ratio', () => {
  const ratio = ratioForChatWidth(1000, 420)
  assert.ok(Math.abs(chatWidthForRatio(1000, ratio) - 420) < 0.001)
})
test('Home and End pixel targets clamp to the same bounds as pointer resizing', () => {
  assert.equal(chatWidthForRatio(1000, ratioForChatWidth(1000, 0)), 320)
  assert.equal(chatWidthForRatio(1000, ratioForChatWidth(1000, 10000)), 639)
})
test('invalid keyboard or unavailable layout resets to a safe ratio', () => {
  assert.equal(ratioForChatWidth(0, 400), WORKSPACE_LAYOUT.defaultRatio)
  assert.equal(ratioForChatWidth(1000, NaN), WORKSPACE_LAYOUT.defaultRatio)
})
test('all supported locales contain the same workspace labels', () => {
  assert.deepEqual(Object.keys(workspaceCopy.zh).sort(), Object.keys(workspaceCopy.en).sort())
  for (const labels of Object.values(workspaceCopy)) for (const text of Object.values(labels)) assert.ok(text.trim())
})
test('a range of widths and drag ratios respects both pane minimums', () => {
  for (let width = MIN_SPLIT_WIDTH; width <= 2560; width += 37) {
    for (let ratio = -1; ratio <= 2; ratio += 0.1) {
      const chat = chatWidthForRatio(width, ratio)
      assert.ok(chat >= 320)
      assert.ok(width - 1 - chat >= 360 - 1e-9)
    }
  }
})
