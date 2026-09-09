// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { usePanelFrameControl } from './usePanelFrameControl';

describe('usePanelFrameControl',() => {
  it('replaces the published control without passing through null',() => {
    const setControl = vi.fn();
    function Host({ label }:{ label:string }) {
      usePanelFrameControl(setControl,label);
      return null;
    }
    const view = render(<Host label="one" />);
    expect(setControl.mock.calls.map((call) => call[0])).toEqual(['one']);
    view.rerender(<Host label="two" />);
    expect(setControl.mock.calls.map((call) => call[0])).toEqual(['one','two']);
    view.unmount();
    expect(setControl).toHaveBeenLastCalledWith(null);
  });
});
