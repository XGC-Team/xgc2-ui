// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationNodeLibraryDrawer } from './AutomationNodeLibraryDrawer';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { buildAutomationNodeLibrary,defaultAutomationNodeLibraryItems } from './automationNodeLibrary';
import { composeAutomationNodeWeb } from './nodes/automationNodeWebComposition';
import { processAutomationNodeContributions } from './nodes/process/processAutomationNodeContributions';

describe('AutomationNodeLibraryDrawer', () => {
  it('shows the sole current ROS1 command node at the annotated stable selector', () => {
    const catalog: AutomationNodeCatalogEntry[] = [{
      kind: 'ros1.run',typeVersion: 2,label: 'ROS1 Run / Launch',category: 'ros1',traits: ['effect','wait'],
      parameterSchema: { type: 'object',properties: {
        setupBash: { type: 'string',title: 'ROS1 setup.bash' },
        command: { type: 'string',title: 'Command (rosrun / roslaunch)' },
      } },
    }];
    const nodeComposition = composeAutomationNodeWeb(...processAutomationNodeContributions);
    const items = defaultAutomationNodeLibraryItems(
      buildAutomationNodeLibrary(catalog, [], nodeComposition),
    );
    const view = render(<AutomationNodeLibraryDrawer
      resourceId="automation-1"
      dataXgcRole="automation-node-library"
      dataXgcId="automation-1"
      items={items}
      nodeComposition={nodeComposition}
      onAdd={vi.fn()}
      onClose={vi.fn()}
    />);

    fireEvent.click(view.container.querySelector(
      '[data-xgc-role="automation-node-catalog-category"][data-xgc-id="ros1"]',
    )!);
    expect(view.container.querySelector(
      '[data-xgc-role="automation-node-catalog-description"][data-xgc-id="ros1.run"]',
    )).toHaveTextContent('Select setup.bash, then enter one complete rosrun or roslaunch command.');
    expect(view.container.querySelector(
      '[data-xgc-role="automation-node-catalog-description"][data-xgc-id="ros1.launch"]',
    )).toBeNull();
    expect(view.container.querySelector(
      '.automation-library-catalog-icon[data-xgc-id="ros1.run"]',
    )).not.toHaveAttribute('data-xgc-icon-tone');
  });
});
