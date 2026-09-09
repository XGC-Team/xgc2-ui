import type { ExperimentDocument } from '../experimentModel';
import { configResourceDefinitionEditLocked } from '../../../shared/configResourceProtection';

export type ExperimentWorkflowPresetActions = ReturnType<typeof createExperimentWorkflowPresetActions>;

export function createExperimentWorkflowPresetActions({
  getRendered,
  rememberSaved,
  runtimeActive,
  dashboardEditing,
  save,
  applyDraft,
}: {
  getRendered: () => ExperimentDocument | undefined;
  rememberSaved?: (experiment: ExperimentDocument) => void;
  runtimeActive: boolean;
  dashboardEditing: boolean;
  save?: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>;
  applyDraft?: (experiment: ExperimentDocument) => void;
}) {
  function disabledReason() {
    if (!save && !applyDraft) return 'This dashboard cannot save Experiment workflow inputs.';
    const rendered = getRendered();
    if (!rendered) return 'The current Experiment is unavailable.';
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) return 'This Experiment is read only.';
    if (runtimeActive) {
      return 'Stop the Experiment before changing camera intrinsics.';
    }
    return '';
  }

  async function updatePresetInputs(
    workflowInstanceId: string,
    presetId: string,
    inputs: Record<string,unknown>,
    expectedHeadCommitId: string,
    reason = 'Update Experiment camera intrinsics',
  ) {
    const rendered = getRendered();
    if (!rendered) throw new Error('The current Experiment is unavailable.');
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) throw new Error('This Experiment is read only.');
    if (rendered.branch.headCommitId !== expectedHeadCommitId) {
      throw new Error('The Experiment changed while camera intrinsics were being updated.');
    }
    const refusal = disabledReason();
    if (refusal && !dashboardEditing) throw new Error(refusal);
    if (dashboardEditing && refusal && runtimeActive) throw new Error(refusal);
    const instance = rendered.spec.workflowInstances.find((candidate) => candidate.id === workflowInstanceId);
    if (!instance) throw new Error(`Workflow instance "${workflowInstanceId}" is unavailable.`);
    const preset = instance.actionPresets.find((candidate) => candidate.id === presetId);
    if (!preset) throw new Error(`Action preset "${presetId}" is unavailable.`);
    const nextDocument: ExperimentDocument = {
      ...rendered,
      spec: {
        ...rendered.spec,
        workflowInstances: rendered.spec.workflowInstances.map((candidate) => (
          candidate.id !== workflowInstanceId ? candidate : {
            ...candidate,
            actionPresets: candidate.actionPresets.map((item) => item.id !== presetId ? item : {
              ...item,
              inputs: { ...item.inputs,...inputs },
            }),
          }
        )),
      },
    };
    if (dashboardEditing) {
      if (!applyDraft) throw new Error('This dashboard cannot apply camera intrinsic changes to the Edit draft.');
      applyDraft(nextDocument);
      rememberSaved?.(nextDocument);
      return nextDocument;
    }
    if (!save) throw new Error('This dashboard cannot save Experiment workflow inputs.');
    const saved = await save(nextDocument,reason);
    rememberSaved?.(saved);
    return saved;
  }

  return { updatePresetInputs,disabledReason };
}
