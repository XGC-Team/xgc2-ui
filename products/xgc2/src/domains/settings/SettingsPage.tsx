import { Suspense } from 'react';
import {
  useProductWebComposition,
  type ProductSettingsContext,
} from '../../shared/productWebComposition';

export function SettingsPage(context: ProductSettingsContext) {
  const { settings } = useProductWebComposition();

  return (
    <div className="xgc-workspace-full-span settings-page" data-xgc-role="station-settings-page" data-xgc-id="station-settings-page">
      <div className="settings-layout xgc-settings-form">
        {settings.sections.map(({ id,component: Section }) => (
          <Suspense key={id} fallback={null}>
            <Section {...context} />
          </Suspense>
        ))}
      </div>
    </div>
  );
}
