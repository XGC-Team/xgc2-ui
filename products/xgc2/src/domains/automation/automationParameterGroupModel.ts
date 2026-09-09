export type AutomationParameterGroup = {
  id: string;
  label: string;
  collapsed: boolean;
  parameters: string[];
};

export function automationParameterGroups(schema: Record<string,unknown> | undefined): AutomationParameterGroup[] {
  const rawGroups = schema?.['x-xgc-parameter-groups'];
  if (!Array.isArray(rawGroups)) return [];
  const properties = isRecord(schema?.properties) ? schema.properties : undefined;
  const usedIDs = new Set<string>();
  const usedParameters = new Set<string>();
  return rawGroups.flatMap((rawGroup) => {
    if (!isRecord(rawGroup)) return [];
    const id = typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '';
    const label = typeof rawGroup.label === 'string' ? rawGroup.label.trim() : '';
    const parameters = Array.isArray(rawGroup.parameters) ? rawGroup.parameters : [];
    if (!id || /[\s:/]/.test(id) || !label || label !== rawGroup.label
      || parameters.length === 0
      || parameters.some((value) => typeof value !== 'string' || value.trim() !== value || value.length === 0)
      || new Set(parameters).size !== parameters.length
      || usedIDs.has(id)
      || parameters.some((name) => usedParameters.has(name))
      || (properties && parameters.some((name) => !(name in properties)))) return [];
    usedIDs.add(id);
    const parameterNames = parameters as string[];
    parameterNames.forEach((name) => usedParameters.add(name));
    return [{ id,label,collapsed: rawGroup.collapsed !== false,parameters: parameterNames }];
  });
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
