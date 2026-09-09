import { describe,expect,it } from 'vitest';
import {
  CONFIG_SYSTEM_FOLDER_ID,
  CONFIG_TEMPLATES_FOLDER_ID,
  CONFIG_USER_FOLDER_ID,
  configResourceArchiveLocked,
  configResourceDefinitionEditLocked,
  configResourceFolderId,
  configResourceIsProtected,
  configResourceProtection,
  userNamespaceIdForFolder,
} from './configResourceProtection';

describe('configResourceProtection', () => {
  it('classifies only Core-owned resources as system or templates', () => {
    expect(configResourceProtection({ system: true }, ['runtime'])).toBe('system');
    expect(configResourceProtection({ system: true }, ['template'])).toBe('template');
    expect(configResourceProtection({ system: true }, ['built-in'])).toBe('system');
    expect(configResourceProtection({ system: false }, ['template','built-in'])).toBe('user');
    expect(configResourceProtection({}, ['template'])).toBe('user');
  });

  it('maps protected resources to fixed roots and users to their namespace', () => {
    expect(configResourceFolderId({ system: true }, [])).toBe(CONFIG_SYSTEM_FOLDER_ID);
    expect(configResourceFolderId({ system: true }, ['template'])).toBe(CONFIG_TEMPLATES_FOLDER_ID);
    expect(configResourceFolderId({ system: false }, [])).toBe(CONFIG_USER_FOLDER_ID);
    expect(configResourceFolderId({ system: false,namespaceId: 'field' }, [])).toBe('field');
    expect(configResourceIsProtected({ system: true }, ['template'])).toBe(true);
    expect(configResourceIsProtected({ system: false }, ['template'])).toBe(false);
  });

  it('locks definition edits only for pure system rows (templates stay editable)', () => {
    expect(configResourceDefinitionEditLocked({ system: false }, [])).toBe(false);
    expect(configResourceDefinitionEditLocked({ system: true }, ['template'])).toBe(false);
    expect(configResourceDefinitionEditLocked({ system: true }, ['built-in'])).toBe(true);
    expect(configResourceDefinitionEditLocked({ system: true }, ['runtime'])).toBe(true);
  });

  it('locks archive for every system-backed resource including templates', () => {
    expect(configResourceArchiveLocked({ system: true })).toBe(true);
    expect(configResourceArchiveLocked({ system: false })).toBe(false);
  });

  it('keeps only the fixed User root mapped to the empty namespace', () => {
    expect(userNamespaceIdForFolder(CONFIG_USER_FOLDER_ID)).toBeUndefined();
    expect(userNamespaceIdForFolder('field')).toBe('field');
  });
});
