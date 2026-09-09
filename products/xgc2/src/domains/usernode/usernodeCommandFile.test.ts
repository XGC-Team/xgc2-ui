import { describe,expect,it } from 'vitest';
import {
  accountHomeFromHostHome,
  hostPathForCommandFile,
  hostPathsForCommandFile,
  parseUsernodeCommandFilePath,
  publicUserScriptRelativePath,
  replaceCommandFilePath,
} from './usernodeCommandFile';

describe('parseUsernodeCommandFilePath', () => {
  it('reads a quoted $HOME path from a one-line invoke', () => {
    expect(parseUsernodeCommandFilePath(
      'python3 "$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py" --endpoint 127.0.0.1:14561',
    )).toBe('$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py');
  });

  it('reads a quoted tilde path and a sudo bash invoke', () => {
    expect(parseUsernodeCommandFilePath(
      'sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-network.sh" --yes --lan-address 192.168.51.XX',
    )).toBe('$HOME/Documents/XGC/UserScripts/FS150/configure-network.sh');
    expect(parseUsernodeCommandFilePath("bash '~/Documents/XGC/UserScripts/script.sh'")).toBe(
      '~/Documents/XGC/UserScripts/script.sh',
    );
  });

  it('rejects a multiline body, parent traversal, and an invoke with no file path', () => {
    expect(parseUsernodeCommandFilePath('#!/usr/bin/env bash\necho ready\n')).toBeNull();
    expect(parseUsernodeCommandFilePath('bash "$HOME/Documents/XGC/UserScripts/../secret.sh"')).toBeNull();
    expect(parseUsernodeCommandFilePath('echo ready')).toBeNull();
  });
});

describe('replaceCommandFilePath', () => {
  it('rewrites the quoted public file in a one-line invoke', () => {
    expect(replaceCommandFilePath(
      'sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh" --yes',
      '$HOME/Documents/XGC/UserScripts/FS150/configure-network.sh',
    )).toBe('sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-network.sh" --yes');
  });
});

describe('hostPathForCommandFile', () => {
  it('keeps the invoke path so Core can expand $HOME and remap UserScripts', () => {
    expect(hostPathForCommandFile('$HOME/Documents/XGC/UserScripts/a.sh')).toBe(
      '$HOME/Documents/XGC/UserScripts/a.sh',
    );
  });

  it('adds the host Documents path when Core home is the local-fleet container home', () => {
    expect(publicUserScriptRelativePath('$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh'))
      .toBe('FS150/configure-linux.sh');
    expect(accountHomeFromHostHome('/home/tester/xgc2')).toBe('/home/tester');
    expect(hostPathsForCommandFile(
      '$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh',
      '/home/tester/xgc2',
    )).toEqual([
      '$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh',
      '/home/tester/Documents/XGC/UserScripts/FS150/configure-linux.sh',
    ]);
  });
});
