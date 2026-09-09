// @vitest-environment jsdom

import { act } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { mountProductWebApp } from './productWebBootstrap';

describe('mountProductWebApp',() => {
  it('reuses the existing React root when bootstrap executes again',async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const consoleError = vi.spyOn(console,'error').mockImplementation(() => undefined);

    let firstRoot:ReturnType<typeof mountProductWebApp> | undefined;
    await act(async () => {
      firstRoot = mountProductWebApp(container,<div data-testid="first-mount">First</div>);
    });
    let secondRoot:ReturnType<typeof mountProductWebApp> | undefined;
    await act(async () => {
      secondRoot = mountProductWebApp(container,<div data-testid="second-mount">Second</div>);
    });

    expect(secondRoot).toBe(firstRoot);
    expect(container.querySelectorAll('[data-testid="second-mount"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="first-mount"]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('createRoot'));

    await act(async () => secondRoot!.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
