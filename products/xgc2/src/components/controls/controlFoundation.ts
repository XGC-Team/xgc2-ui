export type ControlSize = 'default' | 'compact';

export function controlClassNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
}
