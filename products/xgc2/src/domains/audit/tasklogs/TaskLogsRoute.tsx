import { useNavigation } from '../../../app/navigationContext';
import { TaskLogsPage } from './TaskLogsPage';

export function TaskLogsRoute() {
  const nav = useNavigation();
  return <TaskLogsPage language={nav.language} />;
}
