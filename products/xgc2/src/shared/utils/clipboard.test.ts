// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { writeClipboardText } from './clipboard';

describe('writeClipboardText', () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
  });

  it('uses the asynchronous Clipboard API when it succeeds', async () => {
    await writeClipboardText('exact text  ');
    expect(writeText).toHaveBeenCalledWith('exact text  ');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to a temporary selection when Clipboard API permission is denied', async () => {
    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    vi.mocked(document.execCommand).mockReturnValueOnce(true);

    await expect(writeClipboardText('fallback text')).resolves.toBeUndefined();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea[aria-hidden="true"]')).toBeNull();
  });

  it('rejects instead of reporting false success when both clipboard paths fail', async () => {
    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await expect(writeClipboardText('not copied')).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});
