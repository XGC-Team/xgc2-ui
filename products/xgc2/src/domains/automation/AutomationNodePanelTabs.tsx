import { useId,useState,type ReactNode } from 'react';
import { SegmentedControl,type SegmentedControlOption } from '../../components/SegmentedControl';
import { useAutomationCanvasText } from './automationCanvasMessages';

export type AutomationNodePanelTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function AutomationNodePanelTabs({ nodeId,tabs }: {
  nodeId: string;
  tabs: readonly AutomationNodePanelTab[];
}) {
  const t = useAutomationCanvasText();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const tabID = useId();
  return (
    <div className="automation-node-inspector" data-xgc-role="automation-node-inspector" data-xgc-id={nodeId} data-xgc-required-markers="hidden">
      <header className="automation-node-inspector-header">
        <span className="automation-node-pane-title">{t('Node properties')}</span>
        <div className="automation-node-inspector-actions">
          <AutomationPaneTabs
            ariaLabel={t('Node properties')}
            className="automation-node-property-tabs"
            dataXgcId={nodeId}
            dataXgcRole="automation-node-property-tabs"
            onChange={setActiveTab}
            optionDataXgcRole="automation-node-property-tab"
            options={tabs.map((tab) => ({
              ariaControls: `${tabID}-${tab.id}-panel`,
              dataXgcId: `${nodeId}:${tab.id}`,
              id: `${tabID}-${tab.id}-tab`,
              label: tab.label,
              value: tab.id,
            }))}
            value={activeTab}
          />
        </div>
      </header>
      {tabs.map((tab) => activeTab === tab.id && (
        <section
          id={`${tabID}-${tab.id}-panel`}
          className="automation-node-property-panel"
          role="tabpanel"
          aria-labelledby={`${tabID}-${tab.id}-tab`}
          data-xgc-role="automation-node-property-panel"
          data-xgc-id={`${nodeId}:${tab.id}`}
          key={tab.id}
        >
          {tab.content}
        </section>
      ))}
    </div>
  );
}

export function AutomationPaneTabs<Value extends string>({
  value,options,onChange,ariaLabel,className='',dataXgcRole='segmented-control',dataXgcId,optionDataXgcRole,
}: {
  value:Value;
  options:readonly SegmentedControlOption<Value>[];
  onChange:(value:Value)=>void;
  ariaLabel:string;
  className?:string;
  dataXgcRole?:string;
  dataXgcId?:string;
  optionDataXgcRole?:string;
}) {
  return <SegmentedControl
    ariaLabel={ariaLabel}
    asTabs
    className={`automation-pane-tabs automation-node-pane-tabs ${className}`.trim()}
    dataXgcId={dataXgcId}
    dataXgcRole={dataXgcRole}
    onChange={onChange}
    optionDataXgcRole={optionDataXgcRole}
    options={options}
    size="default"
    value={value}
    variant="contained"
  />;
}
