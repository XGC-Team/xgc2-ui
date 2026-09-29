import type { HtmlTagDescriptor, Plugin } from 'vite';

/**
 * Faces that paint the first frame: the Latin subset of the bundled Inter
 * Variable (all UI text) and JetBrains Mono 400 (the code role). They are
 * bundled locally by @fontsource; this only lets the browser fetch them in
 * parallel with the entry chunk instead of after CSS layout, so the first
 * paint does not reflow when the fallback face swaps out.
 */
export const FIRST_PAINT_FONT_FACES = [
  'inter-latin-wght-normal',
  'jetbrains-mono-latin-400-normal',
] as const;

type BundleAsset = { type: string; fileName: string; name?: string; names?: readonly string[] };

export function fontPreloadTags(
  bundle: Record<string, BundleAsset>,
  base: string,
  faces: readonly string[] = FIRST_PAINT_FONT_FACES,
): HtmlTagDescriptor[] {
  const assets = Object.values(bundle).filter((item) => item.type === 'asset' && item.fileName.endsWith('.woff2'));
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return faces.flatMap((face) => {
    const asset = assets.find((item) => [...(item.names ?? []), item.name ?? '']
      .some((name) => name.replace(/\.woff2$/, '') === face));
    if (!asset) return [];
    return [{
      tag: 'link',
      attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `${prefix}${asset.fileName}` },
      injectTo: 'head' as const,
    }];
  });
}

/** Build-only: dev serves the faces straight from node_modules. */
export function fontPreloadPlugin(faces: readonly string[] = FIRST_PAINT_FONT_FACES): Plugin {
  let base = '/';
  return {
    name: 'xgc-font-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        if (!context.bundle) return [];
        return fontPreloadTags(context.bundle as unknown as Record<string, BundleAsset>, base, faces);
      },
    },
  };
}
