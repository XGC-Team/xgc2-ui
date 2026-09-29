import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import '../../styles/operations.css';
import { OperationsPage } from './OperationsPage';
import { selectedExecutionTargetId } from './executionTarget';

export function OperationsRoute() {
  const nav = useNavigation((state) => ({ managedHostId: state.managedHostId }));
  const { selectedTargetCore } = useTargetCore();
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  return <OperationsPage key={targetId} targetId={targetId} />;
}
