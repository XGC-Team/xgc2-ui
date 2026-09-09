// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe,expect,it } from 'vitest';
import { productWebComposition } from '../../../profiles/core-dev';
import { ProductWebCompositionProvider } from '../../shared/productWebComposition';
import { PageTitle } from './topbar';

function renderWithComposition(ui: ReactElement) {
  return render(
    <ProductWebCompositionProvider composition={productWebComposition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
}

describe('topbar page title', () => {
  it('localizes the single page title from the shared UI language state', () => {
    renderWithComposition(
      <PageTitle
        page="settings"
        language="zh-CN"
      />,
    );

    expect(screen.getByText('设置')).toBeInTheDocument();
  });

  it('renders one stable product page title without detail hierarchy', () => {
    renderWithComposition(
      <PageTitle
        page="automations"
        language="en-US"
      />,
    );

    expect(screen.getByText('Automations')).toBeInTheDocument();
    expect(screen.queryByText('Mission workflow')).not.toBeInTheDocument();
  });
});
