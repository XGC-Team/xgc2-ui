// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../../profiles/core-dev';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { ProductWebCompositionProvider } from '../../shared/productWebComposition';
import { selectControlOption } from '../../test/selectControlTestUtils';
import { SettingsPage } from './SettingsPage';

function renderWithComposition(ui: ReactElement) {
  return render(
    <ProductWebCompositionProvider composition={productWebComposition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
}

function renderSettings(props: {
  skin?: 'dark' | 'light';
  language?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  onSkinChange?: (skin: 'dark' | 'light') => void;
} = {}) {
  return renderWithComposition(
    <SettingsPage
      skin={props.skin ?? 'dark'}
      language={props.language ?? 'en-US'}
      onLanguageChange={props.onLanguageChange ?? vi.fn()}
      onSkinChange={props.onSkinChange ?? vi.fn()}
    />,
  );
}

describe('SettingsPage', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
    delete document.documentElement.dataset.xgcTextSelection;
    vi.unstubAllGlobals();
  });

  it('mounts and interacts with closed Settings without AppStore/Docker requests or preference reads', async () => {
    const fetchMock = vi.fn();
    const preferenceRead = vi.spyOn(Storage.prototype,'getItem');
    vi.stubGlobal('fetch',fetchMock);

    const { container } = renderSettings();

    expect(await findSettingsControl('Language')).toBeInTheDocument();
    selectControlOption('Theme','Light');
    fireEvent.click(screen.getByLabelText('Field help tooltips'));
    expect(container.querySelector('[data-xgc-role="app-store-settings"]')).toBeNull();
    expect(screen.queryByText('App store')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(preferenceRead.mock.calls
      .map(([key]) => String(key))
      .filter((key) => /app.?store|docker|container/i.test(key)))
      .toEqual([]);
  });

  it('does not expose obsolete preference options', async () => {
    renderSettings();

    expect(await findSettingsControl('Language')).toBeInTheDocument();
    expect(screen.queryByText('Workspace density')).not.toBeInTheDocument();
    expect(screen.queryByText('Time display')).not.toBeInTheDocument();
    expect(screen.queryByText('Startup page')).not.toBeInTheDocument();
  });

  it('uses a Theme combobox with the same control pattern as Language', async () => {
    const onSkinChange = vi.fn();
    const { container } = renderSettings({ onSkinChange });

    expect(await findSettingsControl('Theme')).toBeInTheDocument();

    const theme = container.querySelector('[data-xgc-role="skin-options"]');
    const language = container.querySelector('[data-xgc-role="station-language"]');
    expect(theme).toHaveAttribute('data-xgc-control', 'select');
    expect(language).toHaveAttribute('data-xgc-control', 'select');
    expect(screen.getByLabelText('Theme')).toHaveAttribute('aria-haspopup', 'listbox');

    selectControlOption('Theme', 'Light');
    expect(onSkinChange).toHaveBeenCalledWith('light');
    expect(screen.queryByRole('button', { name: 'XGC1' })).not.toBeInTheDocument();
  });

  it('renders appearance with only language and theme as collapsible ConfigSection groups without top-level tabs', async () => {
    const { container } = renderSettings();

    const skinSection = await waitFor(() => {
      const el = container.querySelector('[data-xgc-role="station-skin-settings"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(skinSection).toHaveClass('xgc-config-section');
    expect(skinSection).toHaveAttribute('data-xgc-expanded', 'true');
    expect(skinSection).toHaveAttribute('data-xgc-id', 'appearance');
    // Language + Theme only — Field help is a separate contribution.
    const appearanceFields = [...skinSection.querySelectorAll('.xgc-form-field')];
    expect(appearanceFields).toHaveLength(2);
    expect(appearanceFields[0]).toHaveAttribute('data-xgc-role', 'station-language-setting');
    expect(appearanceFields[1]).toHaveAttribute('data-xgc-role', 'station-theme-setting');
    expect(appearanceFields[1]).toBe(skinSection.querySelector('[data-xgc-role="config-section-body"] > :last-child'));
    expect(container.querySelectorAll('.ops-setting-row')).toHaveLength(0);

    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Appearance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Tools' })).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm high-risk commands')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit retention days')).not.toBeInTheDocument();
  });

  it('renders field help as an independent ConfigSection and persists the toggle', async () => {
    const { container } = renderSettings({ skin: 'light' });

    const fieldSection = await waitFor(() => {
      const el = container.querySelector('[data-xgc-role="station-field-tooltips-settings"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(fieldSection).toHaveClass('xgc-config-section');
    expect(fieldSection).toHaveAttribute('data-xgc-id', 'field-tooltips');
    expect(fieldSection).toHaveAttribute('data-xgc-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Field help' })).toHaveAttribute('aria-expanded', 'true');

    // Not nested under Appearance.
    const skinSection = container.querySelector('[data-xgc-role="station-skin-settings"]');
    expect(skinSection?.querySelector('[data-xgc-role="station-field-tooltips"]')).toBeNull();

    const toggle = screen.getByLabelText('Field help tooltips');
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('xgc.fieldTooltips')).toBeNull();
    expect(container.querySelector('[data-xgc-role="station-field-tooltips"]')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem('xgc.fieldTooltips')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('xgc.fieldTooltips')).toBe('false');
  });

  it('renders Tools as an independent ConfigSection and persists the Mark Prompt hover control', async () => {
    const { container } = renderSettings({ skin: 'light' });

    const toolsSection = await waitFor(() => {
      const el = container.querySelector('[data-xgc-role="station-tools-settings"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(toolsSection).toHaveClass('xgc-config-section');
    expect(toolsSection).toHaveAttribute('data-xgc-id', 'tools');
    expect(toolsSection).toHaveAttribute('data-xgc-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-expanded', 'true');

    const skinSection = container.querySelector('[data-xgc-role="station-skin-settings"]');
    expect(skinSection?.querySelector('[data-xgc-role="station-mark-prompt-dock"]')).toBeNull();

    const toggle = screen.getByLabelText('Mark prompt hover control');
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem('xgc.markPrompt.dockVisible')).toBeNull();
    expect(container.querySelector('[data-xgc-role="station-mark-prompt-dock"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="station-mark-prompt-dock-setting"]')).toBe(
      toolsSection.querySelector('[data-xgc-role="config-section-body"] > :last-child'),
    );

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('xgc.markPrompt.dockVisible')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem('xgc.markPrompt.dockVisible')).toBe('true');
  });

  it('persists page text selection from Tools and applies it across the document', async () => {
    const { container } = renderSettings({ skin:'light' });
    const toolsSection = await waitFor(() => {
      const element = container.querySelector('[data-xgc-role="station-tools-settings"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    const toggle = screen.getByLabelText('Select and copy page text');

    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem('xgc.textSelection.enabled')).toBeNull();
    expect(container.querySelector('[data-xgc-role="station-text-selection-setting"]')).toBe(
      toolsSection.querySelector('[data-xgc-role="config-section-body"] > :first-child'),
    );

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('xgc.textSelection.enabled')).toBe('false');
    expect(document.documentElement).toHaveAttribute('data-xgc-text-selection','restricted');

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem('xgc.textSelection.enabled')).toBe('true');
    expect(document.documentElement).toHaveAttribute('data-xgc-text-selection','enabled');
  });

  it('switches appearance language copy and persists the choice', async () => {
    renderWithComposition(<SettingsPageHarness />);

    expect(await findSettingsControl('Language')).toBeInTheDocument();
    selectControlOption('Language', '简体中文');

    expect(screen.getByLabelText('语言')).toBeInTheDocument();
    expect(screen.getByText('主题')).toBeInTheDocument();
    expect(screen.getByLabelText('字段帮助提示')).toBeInTheDocument();
    expect(await screen.findByLabelText('选择并复制页面文字')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mark Prompt 悬停控件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '外观' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '字段帮助' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '工具' })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem('xgc-language')).toBe('"zh-CN"'));
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});

function SettingsPageHarness() {
  const [language, setLanguage] = useState<AppLanguage>('en-US');
  function updateLanguage(next: AppLanguage) {
    localStorage.setItem('xgc-language', JSON.stringify(next));
    document.documentElement.lang = next === 'zh-CN' ? 'zh-CN' : 'en';
    setLanguage(next);
  }
  return (
    <SettingsPage
      skin="dark"
      language={language}
      onLanguageChange={updateLanguage}
      onSkinChange={vi.fn()}
    />
  );
}

function findSettingsControl(name:string) {
  // Product settings sections are route-level lazy chunks. Under the full
  // 300+ file suite, transform contention can exceed Testing Library's 1 s
  // default even though an isolated mount resolves in a few hundred ms.
  return screen.findByLabelText(name,{}, { timeout:5_000 });
}
