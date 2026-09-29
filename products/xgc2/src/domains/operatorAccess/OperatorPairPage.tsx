import { Notice, Panel } from '@xgc2/ui-react';
import { browserLanguagePreference, type AppLanguage } from '../../shared/localization/languagePreference';
import { operatorAccessCopy } from './operatorAccessMessages';
import { useOperatorPairing } from './useOperatorPairing';
import './operator-access.css';

/** Public entry: mount before the regular station's providers/API bootstrap. */
export function OperatorPairPage({ language = browserLanguagePreference(), onPaired }: {
  language?: AppLanguage;
  onPaired?: () => void;
}) {
  const copy = operatorAccessCopy(language);
  const { phase } = useOperatorPairing(onPaired);
  return (
    <main className="operator-pair-page" data-xgc-role="operator-pair-page" data-xgc-id="operator-pair">
      <Panel bodyLayout="column" className="operator-pair-panel" data-xgc-role="operator-pair-panel" data-xgc-id="operator-pair">
        <h1>{copy.pairTitle}</h1>
        <p className="operator-access-muted">{copy.description}</p>
        {phase === 'pairing' || phase === 'paired' ? <p role="status">{phase === 'paired' ? copy.paired : copy.pairing}</p>
          : <Notice tone={phase === 'failed' ? 'danger' : 'neutral'}>{phase === 'failed' ? copy.failed : copy.missing}</Notice>}
      </Panel>
    </main>
  );
}
