/** Parse the public command-file path from a one-line invoke. */

const QUOTED_PATH = /["']((?:\$HOME|~|\/)[^"']+)["']/;
const BARE_PATH = /(?:^|[\s=])((?:\$HOME|~|\/)\S+\.(?:sh|py|bash|zsh))\b/;
const PUBLIC_SCRIPTS_MARKER = '/XGC/UserScripts/';

export function parseUsernodeCommandFilePath(invoke: string): string | null {
  const text = invoke.replace(/\r\n/g, '\n').trim();
  if (!text || text.includes('\n')) return null;
  const quoted = text.match(QUOTED_PATH)?.[1];
  const raw = quoted || text.match(BARE_PATH)?.[1];
  if (!raw || raw.includes('..')) return null;
  return raw;
}

/** Host Files expands `$HOME` and remaps `XGC/UserScripts` to the public directory. */
export function hostPathForCommandFile(filePath: string): string {
  return filePath;
}

export function publicUserScriptRelativePath(filePath: string): string | null {
  const slash = filePath.replace(/\\/g, '/');
  const index = slash.indexOf(PUBLIC_SCRIPTS_MARKER);
  if (index < 0) return null;
  const rel = slash.slice(index + PUBLIC_SCRIPTS_MARKER.length);
  if (!rel || rel.includes('..')) return null;
  return rel;
}

export function accountHomeFromHostHome(hostHome: string): string {
  const home = hostHome.replace(/\/+$/, '');
  return home.endsWith('/xgc2') ? home.slice(0, -'/xgc2'.length) : home;
}

/** `$HOME` / `~` on the running Core is the container home, not Documents. */
export function replaceCommandFilePath(invoke: string, nextPath: string): string {
  const text = invoke.replace(/\r\n/g, '\n').trim();
  const path = nextPath.trim();
  if (!path || path.includes('..') || path.includes('\n')) return text;
  const quoted = `"${path}"`;
  if (QUOTED_PATH.test(text)) return text.replace(QUOTED_PATH, quoted);
  const bare = text.match(BARE_PATH);
  if (bare?.[1]) return text.replace(bare[1], path);
  return text ? `${text} ${quoted}` : `bash ${quoted}`;
}

export function hostPathsForCommandFile(filePath: string, hostHome = ''): string[] {
  const paths: string[] = [];
  const add = (value: string) => {
    if (value && !paths.includes(value)) paths.push(value);
  };
  add(filePath);
  const rel = publicUserScriptRelativePath(filePath);
  if (rel && hostHome) {
    add(`${accountHomeFromHostHome(hostHome)}/Documents/XGC/UserScripts/${rel}`);
  }
  return paths;
}
