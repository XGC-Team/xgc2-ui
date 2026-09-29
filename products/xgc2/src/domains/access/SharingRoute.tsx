import { useNavigation } from '../../app/navigationContext';
import { CollaborationAccessPage } from './CollaborationAccessPage';

export function SharingRoute() {
  const nav = useNavigation((state) => ({ language: state.language }));
  return <CollaborationAccessPage language={nav.language} />;
}
