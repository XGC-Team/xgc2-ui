import { describe, expect, it } from 'vitest';
import { FIRST_PAINT_FONT_FACES, fontPreloadPlugin, fontPreloadTags } from './fontPreloadPlugin';

const bundle = {
  'assets/inter-latin-wght-normal-Dx4kXJAl.woff2': {
    type: 'asset', fileName: 'assets/inter-latin-wght-normal-Dx4kXJAl.woff2', names: ['inter-latin-wght-normal.woff2'],
  },
  'assets/inter-cyrillic-wght-normal-CJ4m0jFs.woff2': {
    type: 'asset', fileName: 'assets/inter-cyrillic-wght-normal-CJ4m0jFs.woff2', names: ['inter-cyrillic-wght-normal.woff2'],
  },
  'assets/jetbrains-mono-latin-400-normal-B9CIFXIH.woff2': {
    type: 'asset', fileName: 'assets/jetbrains-mono-latin-400-normal-B9CIFXIH.woff2', names: ['jetbrains-mono-latin-400-normal.woff2'],
  },
  'assets/jetbrains-mono-latin-400-normal-CTl6CaDz.woff': {
    type: 'asset', fileName: 'assets/jetbrains-mono-latin-400-normal-CTl6CaDz.woff', names: ['jetbrains-mono-latin-400-normal.woff'],
  },
  'assets/index-abc.js': { type: 'chunk', fileName: 'assets/index-abc.js' },
};

describe('font preload', () => {
  it('preloads only the first-paint woff2 faces with their hashed build names', () => {
    expect(fontPreloadTags(bundle, '/')).toEqual([
      {
        tag: 'link',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/assets/inter-latin-wght-normal-Dx4kXJAl.woff2' },
        injectTo: 'head',
      },
      {
        tag: 'link',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/assets/jetbrains-mono-latin-400-normal-B9CIFXIH.woff2' },
        injectTo: 'head',
      },
    ]);
    expect(FIRST_PAINT_FONT_FACES).toHaveLength(2);
  });

  it('respects a relative base and skips faces the bundle does not contain', () => {
    const tags = fontPreloadTags(bundle, './', ['inter-latin-wght-normal', 'missing-face']);
    expect(tags.map((tag) => tag.attrs?.href)).toEqual(['./assets/inter-latin-wght-normal-Dx4kXJAl.woff2']);
  });

  it('only runs for production builds', () => {
    expect(fontPreloadPlugin().apply).toBe('build');
  });
});
