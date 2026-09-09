import { Textarea } from '@xgc2/ui-react';
import { useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type UIEvent } from 'react';
import { FormField } from '../../components/FormPrimitives';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,SearchControl } from '../../components/controls/TextControls';
import { controlClassNames } from '../../components/controls/controlFoundation';
import {
  interpreterUsesSource,
  type UsernodeAssetSpec,
} from './usernodeContractsPublic';
import {
  detectUsernodeSourceLanguage,
  findUsernodeSourceMatches,
  highlightUsernodeSource,
} from './usernodeSourceHighlight';
import './usernode-script-editor.css';

/**
 * UsernodeScriptEditor is the script workspace: name, public file, one-line
 * invoke, and the file body. Interpreter, environment, and declared inputs stay
 * on the stored spec; this page does not expose them. The first `#!` line
 * selects bash vs python highlighting.
 */
export function UsernodeScriptEditor({
  spec,
  publicFile,
  inputCommand,
  body,
  readOnly,
  onChange,
  onPublicFileChange,
  onInputCommandChange,
  onBodyChange,
  onSave,
  saving,
  saveDisabled,
  saveTitle,
}: {
  spec: UsernodeAssetSpec;
  publicFile: string;
  inputCommand: string;
  body: string;
  readOnly: boolean;
  onChange: (next: UsernodeAssetSpec) => void;
  onPublicFileChange: (value: string) => void;
  onInputCommandChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
  saveTitle: string;
}) {
  const usesSource = interpreterUsesSource(spec.interpreter);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = findUsernodeSourceMatches(body, query);
  const activeMatch = matches.length ? ((activeIndex % matches.length) + matches.length) % matches.length : 0;

  function patch(changes: Partial<UsernodeAssetSpec>) {
    onChange({ ...spec,...changes });
  }

  function moveMatch(delta: number) {
    if (!matches.length) return;
    setActiveIndex((current) => (current + delta + matches.length) % matches.length);
  }

  return (
    <div className="usernode-script-workspace" data-xgc-role="usernode-script-editor" data-xgc-id="usernode-script-editor">
      <div className="usernode-script-toolbar" data-xgc-role="usernode-script-toolbar" data-xgc-id="usernode-script-toolbar">
        <div className="usernode-script-toolbar-start">
          {usesSource && (
            <UsernodeSourceSearch
              query={query}
              matchCount={matches.length}
              activeMatch={activeMatch}
              onQueryChange={(value) => {
                setQuery(value);
                setActiveIndex(0);
              }}
              onMove={moveMatch}
            />
          )}
        </div>
        <ControlButton
          dataXgcRole="usernode-asset-save" dataXgcId="usernode-asset-save"
          disabled={saveDisabled}
          title={saveTitle}
          onClick={() => onSave()}
        >{saving ? 'Saving…' : 'Save'}</ControlButton>
      </div>
      {usesSource && (
        <>
          <div className="usernode-script-identity">
            <FormField label="Script name" dataXgcRole="usernode-script-name-field" dataXgcId="usernode-script-name-field">
              <InputControl
                value={spec.name}
                disabled={readOnly}
                aria-label="Script name"
                dataXgcRole="usernode-script-name" dataXgcId="usernode-script-name"
                onChange={(value) => patch({ name: value })}
              />
            </FormField>
            <FormField label="Public file" dataXgcRole="usernode-public-file-field" dataXgcId="usernode-public-file-field">
              <InputControl
                value={publicFile}
                disabled={readOnly}
                aria-label="Public file"
                dataXgcRole="usernode-public-file" dataXgcId="usernode-public-file"
                onChange={onPublicFileChange}
              />
            </FormField>
            <FormField label="Input command" dataXgcRole="usernode-input-command-field" dataXgcId="usernode-input-command-field">
              <InputControl
                value={inputCommand}
                disabled={readOnly}
                aria-label="Input command"
                dataXgcRole="usernode-input-command" dataXgcId="usernode-input-command"
                onChange={onInputCommandChange}
              />
            </FormField>
          </div>
          <UsernodeHighlightedSourceEditor
            value={body}
            interpreter={spec.interpreter}
            readOnly={readOnly}
            query={query}
            activeMatch={activeMatch}
            matchStarts={matches}
            onChange={onBodyChange}
          />
        </>
      )}
      {!usesSource && (
        <div className="xgc-config-form">
          <FormField label="ROS package" dataXgcRole="usernode-package-field" dataXgcId="usernode-package-field">
            <InputControl
              value={spec.package}
              disabled={readOnly}
              aria-label="ROS package"
              dataXgcRole="usernode-package" dataXgcId="usernode-package"
              onChange={(value) => patch({ package: value })}
            />
          </FormField>
          {spec.interpreter === 'rosrun' && (
            <FormField label="Executable" dataXgcRole="usernode-executable-field" dataXgcId="usernode-executable-field">
              <InputControl
                value={spec.executable}
                disabled={readOnly}
                aria-label="ROS executable"
                dataXgcRole="usernode-executable" dataXgcId="usernode-executable"
                onChange={(value) => patch({ executable: value })}
              />
            </FormField>
          )}
          {spec.interpreter === 'roslaunch' && (
            <FormField label="Launch file" dataXgcRole="usernode-launch-file-field" dataXgcId="usernode-launch-file-field">
              <InputControl
                value={spec.launchFile}
                disabled={readOnly}
                aria-label="ROS launch file"
                dataXgcRole="usernode-launch-file" dataXgcId="usernode-launch-file"
                onChange={(value) => patch({ launchFile: value })}
              />
            </FormField>
          )}
        </div>
      )}
    </div>
  );
}

function UsernodeSourceSearch({ query,matchCount,activeMatch,onQueryChange,onMove }: {
  query: string;
  matchCount: number;
  activeMatch: number;
  onQueryChange: (value: string) => void;
  onMove: (delta: number) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onMove(event.shiftKey ? -1 : 1);
  }

  return (
    <>
      <SearchControl
        className="usernode-script-search"
        value={query}
        placeholder="Search"
        ariaLabel="Search script"
        dataXgcRole="usernode-source-search" dataXgcId="usernode-source-search"
        onChange={onQueryChange}
        onKeyDown={onKeyDown}
      />
      {query.trim() ? (
        <span className="usernode-script-search-status" data-xgc-role="usernode-source-search-status" data-xgc-id="usernode-source-search-status">
          {matchCount ? `${activeMatch + 1}/${matchCount}` : '0/0'}
        </span>
      ) : null}
    </>
  );
}

function UsernodeHighlightedSourceEditor({ value,interpreter,readOnly,query,activeMatch,matchStarts,onChange }: {
  value: string;
  interpreter: UsernodeAssetSpec['interpreter'];
  readOnly: boolean;
  query: string;
  activeMatch: number;
  matchStarts: readonly number[];
  onChange: (value: string) => void;
}) {
  const sourceId = useId();
  const highlightRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const language = detectUsernodeSourceLanguage(value, interpreter);
  const needle = query.trim();

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const highlight = highlightRef.current;
    if (!highlight) return;
    highlight.scrollTop = event.currentTarget.scrollTop;
    highlight.scrollLeft = event.currentTarget.scrollLeft;
  }

  useLayoutEffect(() => {
    const highlight = highlightRef.current;
    const input = inputRef.current;
    if (!highlight || !input) return;
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  }, [value]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const start = matchStarts[activeMatch];
    if (!input || start === undefined || !needle) return;
    const end = start + needle.length;
    input.setSelectionRange(start, end);
    const before = value.slice(0, start);
    const line = before.split('\n').length;
    const styles = getComputedStyle(input);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 21;
    const padding = Number.parseFloat(styles.paddingTop) || 0;
    input.scrollTop = Math.max(0, (line - 3) * lineHeight - padding);
    const highlight = highlightRef.current;
    if (highlight) highlight.scrollTop = input.scrollTop;
  }, [activeMatch, matchStarts, needle, value]);

  return (
    <div className="xgc-form-field usernode-source-field" data-xgc-role="usernode-source-field" data-xgc-id="usernode-source-field">
      <label className="xgc-form-field-label" htmlFor={sourceId}>Script body</label>
      <span
        className={controlClassNames('xgc-control', 'xgc-textarea-control', 'usernode-source-editor')}
        data-xgc-control="textarea"
        data-xgc-role="usernode-source" data-xgc-id="usernode-source"
        data-disabled={readOnly || undefined}
      >
        <pre ref={highlightRef} className="usernode-source-highlight" aria-hidden="true">
          <code data-language={language}>
            {highlightUsernodeSource(value, language, needle ? { query: needle, activeIndex: activeMatch } : undefined)}
            {'\n'}
          </code>
        </pre>
        <Textarea
          ref={inputRef}
          id={sourceId}
          className="usernode-source-input"
          spellCheck={false}
          value={value}
          disabled={readOnly}
          onValueChange={onChange}
          onScroll={syncScroll}
        />
      </span>
    </div>
  );
}
