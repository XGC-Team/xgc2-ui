/** Readline beginning-of-line + kill-to-end. Replaces the current input; no CR. */
export const TERMINAL_INPUT_REPLACE = '\x01\x0b';

export function replaceTerminalInputLine(command: string): string {
  return `${TERMINAL_INPUT_REPLACE}${command}`;
}
