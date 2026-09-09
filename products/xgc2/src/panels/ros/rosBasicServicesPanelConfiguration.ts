import { validateRosBasicServicesLayoutOptions } from './rosBasicServicesPanelLayout';

/**
 * Panel options are view-only in Panel v2. Action inputs/defaults are authored
 * on the connected Experiment Action preset by the shared Connections editor.
 */
export function validateRosBasicServicesPanelOptions(options: Record<string,unknown>): string {
  return validateRosBasicServicesLayoutOptions(options);
}
