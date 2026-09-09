import { Breadcrumbs,Button,Topbar } from '@xgc2/ui-react';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { productPageLabel,useProductWebComposition } from '../../shared/productWebComposition';
import { useNavigation } from '../navigationContext';
import { AppWindowControls } from './AppWindowControls';
import { PageTitle } from './topbar';

/**
 * Topbar holds one stable page title, an optional current-resource name, and
 * route-owned action portals. Secondary page partitions live under the left
 * nav parents — not here.
 */
export function AppTopbar({
  mobileNavigationOpen,
  onOpenMobileNavigation,
  onCatalogTitleClick,
  catalogResourceName,
  experimentDetail = false,
  notifications,
}: {
  mobileNavigationOpen: boolean;
  onOpenMobileNavigation?: () => void;
  onCatalogTitleClick?: () => void;
  catalogResourceName?: string;
  experimentDetail?: boolean;
  notifications?: ReactNode;
}) {
  const nav = useNavigation();
  const composition = useProductWebComposition();
  const pageLabel = productPageLabel(composition, nav.page, nav.language);
  const inExperimentDetail = nav.page === 'experiment'
    && (experimentDetail || Boolean(catalogResourceName));
  const hideExperimentCatalogChrome = inExperimentDetail && nav.gcsMode;
  const trailItems = [
    ...(!hideExperimentCatalogChrome && onCatalogTitleClick ? [{
      dataXgcId: nav.page,
      dataXgcRole: 'page-title-back',
      id: 'catalog',
      label: pageLabel,
      onClick: onCatalogTitleClick,
      title: nav.language === 'zh-CN' ? `返回${pageLabel}列表` : `Back to ${pageLabel} list`,
    }] : []),
    ...(!hideExperimentCatalogChrome && catalogResourceName ? [{
      current: true,
      dataXgcId: nav.page,
      dataXgcRole: 'page-title-current',
      id: 'current',
      label: catalogResourceName,
      title: catalogResourceName,
    }] : []),
  ];
  const showTrail = trailItems.length > 0;
  const standaloneTitle = showTrail || hideExperimentCatalogChrome ? undefined : (
    <h1
      className="topbar-page-title"
      data-xgc-role="page-title-current"
      data-xgc-id={nav.page}
      aria-current="page"
    >
      <PageTitle page={nav.page} language={nav.language} />
    </h1>
  );
  const brand = showTrail ? (
    <Breadcrumbs
      ariaLabel={nav.language === 'zh-CN' ? '页面层级' : 'Page hierarchy'}
      className="topbar-catalog-trail"
      dataXgcId={nav.page}
      dataXgcRole="product-breadcrumbs"
      items={trailItems}
    />
  ) : standaloneTitle;
  return (
    <Topbar
      className="topbar"
      data-xgc-role="app-topbar"
      data-xgc-id="app-topbar"
      brand={brand}
      navigation={onOpenMobileNavigation ? <Button
          appearance="ghost"
          aria-expanded={mobileNavigationOpen}
          aria-label={nav.language === 'zh-CN' ? '打开导航' : 'Open navigation'}
          data-xgc-role="mobile-navigation-open"
          data-xgc-id="mobile-navigation-open"
          iconOnly
          onClick={onOpenMobileNavigation}
          uiSize="compact"
        ><Menu size={16} /></Button> : undefined}
      actions={<>
        <div id="xgc-experiment-topbar-slot" className="experiment-topbar-slot" />
        <div id="xgc-page-topbar-actions" className="page-topbar-actions" />
        {notifications}
        <AppWindowControls language={nav.language} />
      </>}
    />
  );
}
