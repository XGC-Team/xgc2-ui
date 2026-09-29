import { useNavigation } from '../../../app/navigationContext';
import { TaskLogsPage } from './TaskLogsPage';

export function TaskLogsRoute() {
  const nav = useNavigation((state) => ({ language: state.language }));
  return <TaskLogsPage language={nav.language} />;
}
