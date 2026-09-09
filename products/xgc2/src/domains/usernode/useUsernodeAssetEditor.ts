import { useEffect,useState } from 'react';
import { normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import { usernodeAssetMessage } from './usernodeAssetPresentation';
import { parseUsernodeCommandFilePath,replaceCommandFilePath } from './usernodeCommandFile';
import type { UsernodeAssetDocument,UsernodeAssetSpec } from './usernodeContractsPublic';
import { readUsernodeCommandFile,writeUsernodeCommandFile } from './usernodeService';
import { UsernodeAssetCommitConflict } from './usernodeStore';
import { validateUsernodeAssetSpec } from './usernodeValidation';

type AuthoringDraft = {
  spec: UsernodeAssetSpec;
  publicFile: string;
  inputCommand: string;
  body: string;
  commandFile: boolean;
};

function draftFromSpec(spec: UsernodeAssetSpec): AuthoringDraft {
  const publicFile = parseUsernodeCommandFilePath(spec.source) || '';
  if (publicFile) {
    return {
      spec,
      publicFile,
      inputCommand: spec.source.replace(/\r\n/g, '\n').trim(),
      body: '',
      commandFile: true,
    };
  }
  return {
    spec,
    publicFile: '',
    inputCommand: '',
    body: spec.source,
    commandFile: false,
  };
}

function specForCommit(draft: AuthoringDraft): UsernodeAssetSpec {
  if (draft.commandFile) {
    return { ...draft.spec, source: draft.inputCommand.replace(/\r\n/g, '\n').trim() };
  }
  return { ...draft.spec, source: draft.body };
}

/** Owns script draft hydration, validation and the file-write-before-commit sequence. */
export function useUsernodeAssetEditor({ document,readOnly,onCommit }: {
  document: UsernodeAssetDocument;
  readOnly: boolean;
  onCommit: (base: UsernodeAssetDocument, spec: UsernodeAssetSpec, reason: string) => Promise<UsernodeAssetDocument>;
}) {
  const [draft, setDraft] = useState<AuthoringDraft>(() => draftFromSpec(document.spec));
  const [baselineBody, setBaselineBody] = useState(document.spec.source);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const next = draftFromSpec(document.spec);
    setDraft(next);
    if (!next.commandFile) {
      setBaselineBody(document.spec.source);
      return;
    }
    let cancelled = false;
    setBaselineBody('');
    void readUsernodeCommandFile(next.publicFile).then((content) => {
      if (cancelled) return;
      setBaselineBody(content);
      setDraft((current) => current.commandFile ? { ...current, body: content } : current);
    }).catch((cause) => {
      if (cancelled) return;
      setError(usernodeAssetMessage(cause) || 'Unable to read the public command file.');
    });
    return () => { cancelled = true; };
  }, [document.branch.headCommitId, document.spec]);

  const committed = specForCommit(draft);
  const validationError = validateUsernodeAssetSpec(committed)
    || (draft.commandFile && !draft.body.trim() ? 'Script body is required.' : '')
    || (draft.commandFile && !draft.publicFile.trim() ? 'Public file is required.' : '')
    || (draft.commandFile && !draft.inputCommand.trim() ? 'Input command is required.' : '');
  const specDirty = JSON.stringify(normalizeUsernodeAssetSpec(committed)) !== JSON.stringify(normalizeUsernodeAssetSpec(document.spec));
  const bodyDirty = draft.body !== baselineBody;
  const dirty = specDirty || bodyDirty;
  const saveTitle = readOnly
    ? 'Templates and system scripts are read-only.'
    : validationError || (dirty ? 'Save this version' : 'No changes to save');

  function setPublicFile(value: string) {
    setDraft((current) => ({
      ...current,
      publicFile: value,
      inputCommand: replaceCommandFilePath(current.inputCommand || current.spec.source, value),
      commandFile: Boolean(parseUsernodeCommandFilePath(replaceCommandFilePath(current.inputCommand || current.spec.source, value))),
    }));
  }

  function setInputCommand(value: string) {
    const publicFile = parseUsernodeCommandFilePath(value) || '';
    setDraft((current) => ({
      ...current,
      inputCommand: value,
      publicFile: publicFile || current.publicFile,
      commandFile: Boolean(publicFile),
    }));
  }

  async function save() {
    if (readOnly || saving || !dirty || validationError) return;
    setError('');
    setSaving(true);
    try {
      const nextSpec = normalizeUsernodeAssetSpec(specForCommit(draft));
      if (draft.commandFile && bodyDirty) {
        await writeUsernodeCommandFile(draft.publicFile, draft.body);
      }
      if (specDirty) {
        await onCommit(document, nextSpec, 'Update user script');
      } else {
        setBaselineBody(draft.body);
      }
    } catch (cause) {
      if (cause instanceof UsernodeAssetCommitConflict) {
        setError('This user script changed elsewhere. Reopen the latest version before editing again.');
      } else {
        setError(usernodeAssetMessage(cause));
      }
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    saving,
    error,
    saveDisabled: readOnly || saving || !dirty || Boolean(validationError),
    saveTitle,
    setSpec: (spec: UsernodeAssetSpec) => setDraft((current) => ({ ...current, spec })),
    setBody: (body: string) => setDraft((current) => ({ ...current, body })),
    setPublicFile,
    setInputCommand,
    save,
  };
}
