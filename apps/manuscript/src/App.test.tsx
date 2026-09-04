import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const documentBody = {
  source: { path: 'main.tex', text: '\\section{Loop}\nThis paragraph is the SyncTeX target.\n' },
  pages: [{ number: 1, text: 'This paragraph is the SyncTeX target.' }],
  pdfUrl: '',
  synctex: {
    forward: [{ file: 'main.tex', line: 2, page: 1, x: 72, y: 72 }],
    inverse: [{ file: 'main.tex', line: 2, page: 1, x: 72, y: 72 }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects') {
      return { ok: true, json: async () => [
        { id: 'paper-comm-dmpc', title: 'paper-comm-dmpc', entryPoint: 'main.tex' },
        { id: 'paper-fixture', title: 'paper-fixture', entryPoint: 'main.tex' },
      ] };
    }
    if (url.startsWith('/api/projects/paper-fixture/synctex/forward')) {
      return { ok: true, json: async () => ({ page: 1, x: 72, y: 72 }) };
    }
    if (url.startsWith('/api/projects/paper-fixture/synctex/inverse')) {
      return { ok: true, json: async () => ({ file: 'main.tex', line: 2, column: 1 }) };
    }
    if (url.startsWith('/api/projects/paper-fixture/build')) {
      return { ok: true, json: async () => ({ status: 'succeeded', diagnostics: [] }) };
    }
    if (url.startsWith('/api/projects/paper-fixture/file') && init?.method === 'PUT') {
      return { ok: true, text: async () => '' };
    }
    if (url.startsWith('/api/projects/paper-fixture')) {
      return { ok: true, json: async () => documentBody };
    }
    if (url.startsWith('/api/projects/paper-comm-dmpc')) {
      return { ok: true, json: async () => ({ source: { path: 'main.tex', text: '' }, pages: null, pdfUrl: '', synctex: {} }) };
    }
    return { ok: false, text: async () => 'missing' };
  }));
}

describe('Manuscript app', () => {
  it('opens a project, builds, jumps, and sends a PDF quote into the composer', async () => {
    stubApi();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Source' })).toHaveValue(
        '\\section{Loop}\nThis paragraph is the SyncTeX target.\n',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(await screen.findByText('succeeded')).toBeInTheDocument();

    const page = screen.getByText('This paragraph is the SyncTeX target.');
    fireEvent.click(page.closest('[data-xgc-role="pdf-page"]')!);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Source' })).toHaveProperty('selectionStart', 15);
    });

    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'This paragraph is the SyncTeX target.',
      anchorNode: page,
    } as unknown as Selection);
    fireEvent.mouseUp(document.querySelector('[data-xgc-role="pdf-pane"]')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(screen.getByPlaceholderText('PDF quotes land here')).toHaveValue(
      'PDF p.1: This paragraph is the SyncTeX target.',
    );
  });
});
