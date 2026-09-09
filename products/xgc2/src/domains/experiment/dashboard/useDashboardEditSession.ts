import { useEffect,useRef,useState } from 'react';
import { configResourceDefinitionEditLocked } from '../../../shared/configResourceProtection';
import type { ExperimentDocument } from '../experimentModel';
import { ExperimentCommitConflict } from '../useExperimentCatalog';

export function useDashboardEditSession({
  selectedExperiment,
  saveExperimentDraft,
}: {
  selectedExperiment?: ExperimentDocument;
  saveExperimentDraft: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>;
}) {
  const [editingRequested,setEditingRequested] = useState(false);
  const [draft,setDraft] = useState<ExperimentDocument | null>(null);
  const [exitConfirmationOpen,setExitConfirmationOpen] = useState(false);
  const [saving,setSaving] = useState(false);
  const [commitConflict,setCommitConflict] = useState('');
  const [saveError,setSaveError] = useState('');
  const saveRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const readOnly = Boolean(selectedExperiment && configResourceDefinitionEditLocked(
    selectedExperiment.head, selectedExperiment.spec.tags,
  ));
  const draftMatchesSelection = Boolean(
    draft && draft.head.resourceId === selectedExperiment?.head.resourceId,
  );
  const editing = editingRequested && draftMatchesSelection && !readOnly;
  const activeDraft = editing && draft ? draft : undefined;
  const visibleExperiment = activeDraft ?? selectedExperiment;

  useEffect(() => {
    const staleDraft = Boolean(draft && (readOnly || draft.head.resourceId !== selectedExperiment?.head.resourceId));
    if (!staleDraft) return;
    saveRevisionRef.current += 1;
    saveInFlightRef.current = false;
    setDraft(null);
    setEditingRequested(false);
    setExitConfirmationOpen(false);
    setCommitConflict('');
    setSaveError('');
    setSaving(false);
  }, [draft,readOnly,selectedExperiment?.head.resourceId]);

  function openDraft(nextDraft: ExperimentDocument) {
    saveRevisionRef.current += 1;
    saveInFlightRef.current = false;
    setDraft(structuredClone(nextDraft));
    setExitConfirmationOpen(false);
    setCommitConflict('');
    setSaveError('');
    setSaving(false);
    setEditingRequested(true);
  }

  function start() {
    if (!selectedExperiment || readOnly || saveInFlightRef.current) return;
    openDraft(selectedExperiment);
  }

  function startWithDraft(nextDraft: ExperimentDocument) {
    if (!selectedExperiment) throw new Error('The current Experiment is unavailable.');
    if (readOnly) throw new Error('This Experiment is read only.');
    if (saveInFlightRef.current) throw new Error('Wait for the current changes to finish saving.');
    if (nextDraft.head.resourceId !== selectedExperiment.head.resourceId
      || nextDraft.branch.headVersion < selectedExperiment.branch.headVersion
      || (nextDraft.branch.headVersion === selectedExperiment.branch.headVersion
        && nextDraft.branch.headCommitId !== selectedExperiment.branch.headCommitId)) {
      throw new Error('The Experiment changed while its Robots were being updated.');
    }
    // A preceding parameter commit may already have returned a newer head while
    // the selected catalog prop still catches up. Preserve that confirmed base.
    openDraft(nextDraft);
  }

  function discard() {
    saveRevisionRef.current += 1;
    saveInFlightRef.current = false;
    setDraft(null);
    setEditingRequested(false);
    setExitConfirmationOpen(false);
    setSaving(false);
    setCommitConflict('');
    setSaveError('');
  }

  async function save() {
    if (readOnly) return;
    const savingDraft = activeDraft;
    if (!savingDraft) {
      setEditingRequested(false);
      return;
    }
    if (saveInFlightRef.current) return;
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    saveInFlightRef.current = true;
    setSaving(true);
    setSaveError('');
    setCommitConflict('');
    try {
      await saveExperimentDraft(savingDraft, 'Update experiment dashboards');
      if (saveRevisionRef.current !== revision) return;
      setDraft(null);
      setEditingRequested(false);
      setExitConfirmationOpen(false);
      setCommitConflict('');
    } catch (cause) {
      if (saveRevisionRef.current !== revision) return;
      if (cause instanceof ExperimentCommitConflict) {
        setDraft({ ...cause.latest,spec: structuredClone(savingDraft.spec) });
        setCommitConflict(cause.message);
      } else {
        setSaveError(messageOf(cause));
      }
    } finally {
      if (saveRevisionRef.current === revision) {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  function requestExit() {
    if (editing) setExitConfirmationOpen(true);
  }

  return {
    activeDraft,
    visibleExperiment,
    editing,
    readOnly,
    saving,
    commitConflict,
    saveError,
    exitConfirmationOpen,
    start,
    startWithDraft,
    discard,
    save,
    requestExit,
    cancelExit: () => setExitConfirmationOpen(false),
    updateDraft: setDraft,
    reportError: setSaveError,
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
