import { resetRobotConnectionStoreForTests } from './robotConnectionStore';
import { resetRobotVisualInvalidationForTests } from './robotVisualInvalidation';

export function resetRobotRuntimeForTests() {
  resetRobotVisualInvalidationForTests();
  resetRobotConnectionStoreForTests();
}
