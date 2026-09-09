import { request } from '../../api/http';
import type { CoreNode } from './coreModel';

export function listCores(): Promise<CoreNode[]> {
  return request<CoreNode[]>('/cores');
}
