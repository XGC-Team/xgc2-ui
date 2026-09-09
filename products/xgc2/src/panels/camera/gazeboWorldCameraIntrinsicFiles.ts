const TIMESTAMPED_INTRINSIC_YAML = /^intrinsics-(\d{8}T\d{6}(?:\.\d+)?Z)\.yaml$/;

export type WorldCameraIntrinsicFileOption = {
  path: string;
  stamp: string;
  latest: boolean;
};

export function isForbiddenIntrinsicAlias(name: string): boolean {
  return name === 'intrinsics.yaml';
}

export function timestampedIntrinsicYamlFiles(
  entries: readonly { name: string; path: string; isDir: boolean }[],
): WorldCameraIntrinsicFileOption[] {
  const matched = entries
    .filter((entry) => !entry.isDir && TIMESTAMPED_INTRINSIC_YAML.test(entry.name) && !isForbiddenIntrinsicAlias(entry.name))
    .map((entry) => ({
      path: entry.path,
      stamp: TIMESTAMPED_INTRINSIC_YAML.exec(entry.name)?.[1] ?? '',
    }))
    .filter((entry) => entry.stamp)
    .sort((left, right) => right.stamp.localeCompare(left.stamp));
  return matched.map((file, index) => ({ ...file, latest: index === 0 }));
}

export function formatIntrinsicStamp(stamp: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(stamp);
  if (!match) return stamp;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

export function worldCameraIntrinsicOptionLabel(
  file: WorldCameraIntrinsicFileOption,
  latestPrefix: string,
): string {
  return `${file.latest ? latestPrefix : ''}${formatIntrinsicStamp(file.stamp)}`;
}
