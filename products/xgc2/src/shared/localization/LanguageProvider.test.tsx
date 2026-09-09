// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { LanguageProvider } from './LanguageProvider';
import { useLocalizedText } from './localizedText';

const messages = { 'Live status': '实时状态' };

describe('LanguageProvider', () => {
  it('updates domain copy when the selected language changes', () => {
    const view = render(<LanguageProvider language="zh-CN"><MessageProbe /></LanguageProvider>);
    expect(screen.getByTestId('localized-message')).toHaveTextContent('实时状态');

    view.rerender(<LanguageProvider language="en-US"><MessageProbe /></LanguageProvider>);
    expect(screen.getByTestId('localized-message')).toHaveTextContent('Live status');
  });
});

function MessageProbe() {
  const text = useLocalizedText(messages);
  return <span data-testid="localized-message">{text('Live status')}</span>;
}
