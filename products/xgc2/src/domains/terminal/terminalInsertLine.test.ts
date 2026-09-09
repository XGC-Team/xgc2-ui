import { describe, expect, it } from 'vitest';
import { replaceTerminalInputLine, TERMINAL_INPUT_REPLACE } from './terminalInsertLine';

describe('replaceTerminalInputLine', () => {
  it('clears the current input line before writing the invoke', () => {
    expect(replaceTerminalInputLine('echo ready')).toBe(`${TERMINAL_INPUT_REPLACE}echo ready`);
    expect(replaceTerminalInputLine('echo ready').endsWith('\n')).toBe(false);
    expect(replaceTerminalInputLine('echo ready').endsWith('\r')).toBe(false);
  });

  it('replaces rather than concatenating two inserts', () => {
    const first = replaceTerminalInputLine('sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh" --yes');
    const second = replaceTerminalInputLine('sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-network.sh" --yes --lan-address 192.168.51.XX');
    expect(second.startsWith(TERMINAL_INPUT_REPLACE)).toBe(true);
    expect(second.includes(first)).toBe(false);
  });
});
