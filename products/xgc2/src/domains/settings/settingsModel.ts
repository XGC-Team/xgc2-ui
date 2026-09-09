export type SkinName = 'dark' | 'light';

export const skinOptions = [
  { id: 'light' },
  { id: 'dark' },
] satisfies Array<{ id: SkinName }>;

export function isSkinName(value: string): value is SkinName {
  return skinOptions.some((option) => option.id === value);
}
