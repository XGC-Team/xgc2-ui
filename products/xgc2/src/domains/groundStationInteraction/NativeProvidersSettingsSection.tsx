import { useEffect,useState } from 'react';
import { Notice } from '@xgc2/ui-react';
import type {
  NativeProviderConfiguration,
  NativeProviderSettingsUpdate,
  NativeSettings,
} from '@xgc2/native-agent/react';
import { ConfigSection } from '../../components/ConfigSection';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormActions,FormField,SwitchControl } from '../../components/FormPrimitives';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import {
  getNativeProviderSettings,
  refreshNativeProviderSettings,
  updateNativeProviderSettings,
} from './groundStationNativeSettingsService';
import { isNativeCompanionUnavailable,operatorNativeErrorMessage } from './nativeCompanionAvailability';

type Draft = {
  revision: string;
  provider: NativeProviderConfiguration;
  enabled: boolean;
  binaryPath: string;
  model: string;
  effort: string;
  permission: string;
};

const PROVIDER_TITLES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  grok: 'Grok',
  opencode: 'OpenCode',
};

export function NativeProvidersSettingsSection({ language }: ProductSettingsContext) {
  const [open,setOpen] = useState(false);
  const [expandedId,setExpandedId] = useState('');
  const [settings,setSettings] = useState<NativeSettings>();
  const [drafts,setDrafts] = useState<Record<string, Draft>>({});
  const [error,setError] = useState('');
  const [unavailable,setUnavailable] = useState(false);
  const [reload,setReload] = useState(0);
  const [busy,setBusy] = useState(false);
  const [savingId,setSavingId] = useState('');
  const chinese = language === 'zh-CN';
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    void getNativeProviderSettings(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setSettings(next);
      setUnavailable(false);
      setError('');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [open,reload]);

  return (
    <ConfigSection
      title={chinese ? 'AI 提供商' : 'AI providers'}
      open={open}
      onOpenChange={setOpen}
      dataXgcRole="station-native-provider-settings"
      dataXgcId="native-providers"
    >
      {settings?.providers.map((provider) => (
        <ProviderRows
          key={provider.id}
          busy={busy || Boolean(savingId)}
          chinese={chinese}
          draft={drafts[provider.id]}
          expanded={expandedId === provider.id}
          provider={provider}
          revision={settings.revision}
          onDiscard={() => setDrafts((current) => {
            const next = { ...current };
            delete next[provider.id];
            return next;
          })}
          onDraftChange={(draft) => setDrafts((current) => ({ ...current, [provider.id]: draft }))}
          onToggle={() => setExpandedId((current) => current === provider.id ? '' : provider.id)}
          onRefresh={async () => {
            setSavingId(provider.id);
            try {
              setSettings(await refreshNativeProviderSettings(provider.id));
              setUnavailable(false);
              setError('');
            } catch (cause: unknown) {
              setUnavailable(isNativeCompanionUnavailable(cause));
              setError(operatorNativeErrorMessage(cause));
            } finally {
              setSavingId('');
            }
          }}
          onSave={async (update) => {
            setSavingId(provider.id);
            try {
              const next = await updateNativeProviderSettings(update);
              setSettings(next);
              setDrafts((current) => {
                const remaining = { ...current };
                delete remaining[provider.id];
                return remaining;
              });
              setUnavailable(false);
              setError('');
            } catch (cause: unknown) {
              setUnavailable(isNativeCompanionUnavailable(cause));
              setError(operatorNativeErrorMessage(cause));
            } finally {
              setSavingId('');
            }
          }}
        />
      ))}
      {error ? <Notice tone="warning" density="compact">{error}</Notice> : null}
      {!settings && (error || unavailable) ? (
        <ControlButton
          size="compact"
          disabled={busy}
          dataXgcRole="station-native-provider-settings-retry"
          dataXgcId="native-providers"
          onClick={() => setReload((value) => value + 1)}
        >{chinese ? '重试连接' : 'Retry connection'}</ControlButton>
      ) : null}
    </ConfigSection>
  );
}

function ProviderRows({
  busy,
  chinese,
  draft,
  expanded,
  onDiscard,
  onDraftChange,
  onRefresh,
  onSave,
  onToggle,
  provider,
  revision,
}: {
  busy: boolean;
  chinese: boolean;
  draft?: Draft;
  expanded: boolean;
  onDiscard: () => void;
  onDraftChange: (draft: Draft) => void;
  onRefresh: () => Promise<void>;
  onSave: (update: NativeProviderSettingsUpdate) => Promise<void>;
  onToggle: () => void;
  provider: NativeProviderConfiguration;
  revision: string;
}) {
  const enabled = draft?.enabled ?? provider.enabled;
  const binaryPath = draft?.binaryPath ?? provider.binaryPath;
  const model = draft?.model ?? provider.defaults.model ?? '';
  const effort = draft?.effort ?? provider.defaults.effort ?? '';
  const permission = draft?.permission ?? provider.defaults.permission ?? '';
  const selectedModel = provider.models.find((item) => item.id === model);
  const locked = busy;
  const dirty = Boolean(draft);
  function change(patch: Partial<Draft>) {
    onDraftChange({
      revision: draft?.revision ?? revision,
      provider: draft?.provider ?? provider,
      enabled,
      binaryPath,
      model,
      effort,
      permission,
      ...patch,
    });
  }
  const disclosureId = `native-providers:${provider.id}`;
  return (
    <>
      <div
        className="config-section-disclosure"
        data-xgc-role="config-section-disclosure"
        data-xgc-id={disclosureId}
      >
        <button
          type="button"
          className="config-section-disclosure-toggle"
          aria-expanded={expanded}
          data-xgc-role="config-section-disclosure-toggle"
          data-xgc-id={disclosureId}
          onClick={onToggle}
        >
          <DisclosureChevron />
          <span className="config-section-disclosure-title">
            {PROVIDER_TITLES[provider.provider] ?? provider.provider}
          </span>
        </button>
        <span
          className="config-section-disclosure-status"
          data-xgc-role="config-section-disclosure-status"
          data-xgc-id={disclosureId}
        >
          {availabilityLabel(provider, chinese)}
        </span>
      </div>
      {expanded ? (
        <>
          <FormField
            label={chinese ? '启用' : 'Enabled'}
            dataXgcRole="native-provider-enabled"
            dataXgcId={provider.id}
          >
            <SwitchControl
              ariaLabel={chinese ? '启用' : 'Enabled'}
              checked={enabled}
              disabled={locked}
              onChange={(next) => change({ enabled: next })}
              dataXgcRole="native-provider-enabled-control"
              dataXgcId={provider.id}
            />
          </FormField>
          <FormField
            label={chinese ? 'CLI 路径' : 'CLI path'}
            dataXgcRole="native-provider-binary-path"
            dataXgcId={provider.id}
          >
            <InputControl
              value={binaryPath}
              disabled={locked}
              placeholder={chinese ? '自动发现' : 'Automatic'}
              onChange={(next) => change({ binaryPath: next })}
              dataXgcRole="native-provider-binary-path-input"
              dataXgcId={provider.id}
            />
          </FormField>
          {provider.models.length ? (
            <FormField
              label={chinese ? '默认模型' : 'Default model'}
              dataXgcRole="native-provider-model-setting"
              dataXgcId={provider.id}
            >
              <SelectControl
                fill
                disabled={locked}
                value={model}
                ariaLabel={chinese ? '默认模型' : 'Default model'}
                options={[
                  { value: '', label: chinese ? '原生默认值' : 'Provider default' },
                  ...provider.models.map((item) => ({ value: item.id, label: item.label })),
                ]}
                onChange={(next) => change({ model: next, effort: '' })}
                dataXgcRole="native-provider-model"
                dataXgcId={provider.id}
              />
            </FormField>
          ) : null}
          {selectedModel?.efforts.length ? (
            <FormField
              label={chinese ? '默认思考强度' : 'Default thinking effort'}
              dataXgcRole="native-provider-effort-setting"
              dataXgcId={provider.id}
            >
              <SelectControl
                fill
                disabled={locked}
                value={effort}
                ariaLabel={chinese ? '默认思考强度' : 'Default thinking effort'}
                options={[
                  { value: '', label: chinese ? '原生默认值' : 'Provider default' },
                  ...selectedModel.efforts.map((item) => ({ value: item.id, label: item.label })),
                ]}
                onChange={(next) => change({ effort: next })}
                dataXgcRole="native-provider-effort"
                dataXgcId={provider.id}
              />
            </FormField>
          ) : null}
          {provider.permissions.length ? (
            <FormField
              label={chinese ? '默认权限' : 'Default permissions'}
              dataXgcRole="native-provider-permission-setting"
              dataXgcId={provider.id}
            >
              <SelectControl
                fill
                disabled={locked}
                value={permission}
                ariaLabel={chinese ? '默认权限' : 'Default permissions'}
                options={[
                  { value: '', label: chinese ? '原生默认值' : 'Provider default' },
                  ...provider.permissions.map((item) => ({ value: item.id, label: item.label })),
                ]}
                onChange={(next) => change({ permission: next })}
                dataXgcRole="native-provider-permission"
                dataXgcId={provider.id}
              />
            </FormField>
          ) : null}
          <FormActions dataXgcRole="native-provider-config-actions" dataXgcId={provider.id}>
            <ControlButton
              size="compact"
              disabled={locked}
              dataXgcRole="native-provider-refresh"
              dataXgcId={provider.id}
              onClick={() => void onRefresh()}
            >{chinese ? '刷新状态' : 'Refresh status'}</ControlButton>
            <ControlButton
              size="compact"
              disabled={locked || !dirty}
              dataXgcRole="native-provider-discard"
              dataXgcId={provider.id}
              onClick={onDiscard}
            >{chinese ? '放弃更改' : 'Discard'}</ControlButton>
            <ControlButton
              size="compact"
              tone="primary"
              disabled={locked || !dirty}
              dataXgcRole="native-provider-save"
              dataXgcId={provider.id}
              onClick={() => void onSave(updateOf({
                revision: draft?.revision ?? revision,
                provider,
                enabled,
                binaryPath,
                model,
                effort,
                permission,
              }))}
            >{chinese ? '保存更改' : 'Save changes'}</ControlButton>
          </FormActions>
        </>
      ) : null}
    </>
  );
}

function DisclosureChevron() {
  return (
    <svg aria-hidden="true" className="config-section-disclosure-chevron" fill="none" height="14" viewBox="0 0 16 16" width="14">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function availabilityLabel(provider: NativeProviderConfiguration, chinese: boolean) {
  if (!provider.enabled) return chinese ? '已停用' : 'Disabled';
  if (provider.available) return chinese ? '可用' : 'Available';
  return provider.detail || (chinese ? '不可用' : 'Unavailable');
}

function updateOf(draft: {
  revision: string;
  provider: NativeProviderConfiguration;
  enabled: boolean;
  binaryPath: string;
  model: string;
  effort: string;
  permission: string;
}): NativeProviderSettingsUpdate {
  const defaults: NativeProviderConfiguration['defaults'] = {};
  if (draft.model) defaults.model = draft.model;
  if (draft.effort) defaults.effort = draft.effort;
  if (draft.permission) defaults.permission = draft.permission;
  return {
    revision: draft.revision,
    provider: {
      id: draft.provider.id,
      provider: draft.provider.provider,
      enabled: draft.enabled,
      binaryPath: draft.binaryPath,
      defaults,
    },
  };
}
