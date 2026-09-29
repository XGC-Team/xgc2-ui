import { decodeExperimentWorldBoundary,reexpressExperimentWorldBoundary,type ExperimentWorldBoundary } from '../experimentWorldBoundary';
import type {
  ExperimentDocument,
  ExperimentLocalizationOffset,
  ExperimentRobotBinding,
  ExperimentScene,
} from '../experimentModel';
import { normalizeExperimentLocalizationOffset } from '../experimentModel';
import { experimentRobotBindingsChangeOnlyInitialPose } from '../experimentInitialPoseAuthoring';
import { experimentRobotBindingsChangeRoster } from '../experimentRobotBindingAuthoring';
import { configResourceDefinitionEditLocked } from '../../../shared/configResourceProtection';

export const EXPERIMENT_ROBOT_ROSTER_EDIT_REASON = 'Enter Edit mode to add or remove Robots.';

export type ExperimentRobotBindingActions = ReturnType<typeof createExperimentRobotBindingActions>;

export function createExperimentRobotBindingActions({
  getRendered,
  rememberSaved,
  runtimeActive,
  dashboardEditing,
  save,
  applyDraft,
  beginEdit,
  saving = false,
}: {
  getRendered: () => ExperimentDocument | undefined;
  rememberSaved?: (experiment: ExperimentDocument) => void;
  runtimeActive: boolean;
  dashboardEditing: boolean;
  save?: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>;
  applyDraft?: (experiment: ExperimentDocument) => void;
  beginEdit?: (experiment: ExperimentDocument) => void;
  saving?: boolean;
}) {
  // React may not render again between queued authoring callbacks. Once the
  // first gesture opens a draft, all subsequent writes belong to that draft.
  let editing = dashboardEditing;

  function disabledReason() {
    if (!save && !applyDraft) return 'This dashboard cannot save changes to Experiment Robots.';
    const rendered = getRendered();
    if (!rendered) return 'The current Experiment is unavailable.';
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) return 'This Experiment is read only.';
    if (saving) return 'Wait for the current changes to finish saving.';
    if (runtimeActive) {
      return 'Experiment Robots cannot be changed while the Experiment is running. Stop it before editing assets.';
    }
    return '';
  }

  function localizationOffsetDisabledReason() {
    const rendered = getRendered();
    if (!rendered) return 'The current Experiment is unavailable.';
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) return 'This Experiment is read only.';
    if (saving) return 'Wait for the current changes to finish saving.';
    if (editing && !applyDraft) return 'This dashboard cannot apply world origin changes to the Edit draft.';
    if (!editing && !save) return 'This dashboard cannot save world origin changes.';
    // The saved origin is consumed at the next restart. Editing the dashboard
    // during an active Run keeps its existing structural authoring lock.
    if (runtimeActive && editing) return disabledReason();
    return '';
  }

  function sceneDisabledReason() {
    const rendered = getRendered();
    if (!rendered) return 'The current Experiment is unavailable.';
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) return 'This Experiment is read only.';
    if (saving) return 'Wait for the current changes to finish saving.';
    if (runtimeActive) {
      return 'The Experiment scene cannot be changed while the Experiment is running. Stop the Experiment before changing the scene.';
    }
    if (editing && !applyDraft) return 'This dashboard cannot apply scene changes to the Edit draft.';
    if (!editing && !save) return 'This dashboard cannot save scene changes to the Experiment.';
    return '';
  }

  async function update(
    bindings: ExperimentRobotBinding[],
    expectedHeadCommitId: string,
    reason = 'Update Experiment Robots',
  ) {
    const rendered = getRendered();
    if (!rendered) throw new Error('The current Experiment is unavailable.');
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) throw new Error('This Experiment is read only.');
    if (rendered.branch.headCommitId !== expectedHeadCommitId) {
      throw new Error('The Experiment changed while its Robots were being updated.');
    }
    const nextDocument: ExperimentDocument = {
      ...rendered,
      spec: {
        ...rendered.spec,
        robots: structuredClone(bindings),
      },
    };
    const rosterChanged = experimentRobotBindingsChangeRoster(rendered.spec.robots,bindings);
    const initialPoseOnly = runtimeActive
      && !saving
      && !editing
      && experimentRobotBindingsChangeOnlyInitialPose(rendered.spec.robots,bindings);
    const refusal = disabledReason();
    if (refusal && !initialPoseOnly) throw new Error(refusal);
    if (JSON.stringify(rendered.spec.robots) === JSON.stringify(bindings)) return rendered;
    if (rosterChanged && !editing) {
      if (!beginEdit) throw new Error(EXPERIMENT_ROBOT_ROSTER_EDIT_REASON);
      beginEdit(nextDocument);
      editing = true;
      rememberSaved?.(nextDocument);
      return nextDocument;
    }
    if (editing) {
      if (!applyDraft) throw new Error('This dashboard cannot apply Robot changes to the Edit draft.');
      applyDraft(nextDocument);
      rememberSaved?.(nextDocument);
      return nextDocument;
    }
    if (!save) throw new Error('This dashboard cannot save changes to Experiment Robots.');
    const saved = await save(nextDocument,reason);
    rememberSaved?.(saved);
    return saved;
  }

  async function updateLocalizationOffset(
    offset: ExperimentLocalizationOffset,
    expectedHeadCommitId: string,
    reason = 'Update Experiment world origin offset',
  ) {
    const rendered = getRendered();
    if (!rendered) throw new Error('The current Experiment is unavailable.');
    if (configResourceDefinitionEditLocked(rendered.head, rendered.spec.tags)) throw new Error('This Experiment is read only.');
    if (rendered.branch.headCommitId !== expectedHeadCommitId) {
      throw new Error('The Experiment changed while its world origin offset was being updated.');
    }
    const refusal = localizationOffsetDisabledReason();
    if (refusal) throw new Error(refusal);
    const nextOffset = normalizeExperimentLocalizationOffset(offset);
    if (
      nextOffset.x === rendered.spec.localizationOffset.x
      && nextOffset.y === rendered.spec.localizationOffset.y
      && nextOffset.z === rendered.spec.localizationOffset.z
    ) {
      return rendered;
    }
    const nextDocument: ExperimentDocument = {
      ...rendered,
      spec: {
        ...rendered.spec,
        localizationOffset: nextOffset,
        worldBoundary: reexpressExperimentWorldBoundary(rendered.spec.worldBoundary,rendered.spec.localizationOffset,nextOffset),
      },
    };
    if (editing) {
      if (!applyDraft) throw new Error('This dashboard cannot apply Robot changes to the Edit draft.');
      applyDraft(nextDocument);
      rememberSaved?.(nextDocument);
      return nextDocument;
    }
    if (!save) throw new Error('This dashboard cannot save changes to Experiment Robots.');
    const saved = await save(nextDocument,reason);
    rememberSaved?.(saved);
    return saved;
  }

  async function updateWorldBoundary(value:ExperimentWorldBoundary | null,expectedHeadCommitId:string,reason = 'Update Experiment world fence') {
    const rendered=getRendered();
    if (!rendered) throw new Error('The current Experiment is unavailable.');
    if (configResourceDefinitionEditLocked(rendered.head,rendered.spec.tags)) throw new Error('This Experiment is read only.');
    if (rendered.branch.headCommitId!==expectedHeadCommitId) throw new Error('The Experiment changed while its world fence was being updated.');
    const refusal=localizationOffsetDisabledReason();
    if (refusal) throw new Error(refusal);
    const boundary=decodeExperimentWorldBoundary(value);
    if (JSON.stringify(boundary)===JSON.stringify(rendered.spec.worldBoundary)) return rendered;
    const nextDocument:ExperimentDocument={...rendered,spec:{...rendered.spec,worldBoundary:boundary}};
    if (editing) {
      if (!applyDraft) throw new Error('This dashboard cannot apply changes to the Edit draft.');
      applyDraft(nextDocument);rememberSaved?.(nextDocument);return nextDocument;
    }
    if (!save) throw new Error('This dashboard cannot save changes to the Experiment.');
    const saved=await save(nextDocument,reason);rememberSaved?.(saved);return saved;
  }

  async function updateScene(
    value:ExperimentScene | undefined,
    expectedHeadCommitId:string,
    reason = 'Update Experiment scene',
  ) {
    const rendered = getRendered();
    if (!rendered) throw new Error('The current Experiment is unavailable.');
    if (configResourceDefinitionEditLocked(rendered.head,rendered.spec.tags)) throw new Error('This Experiment is read only.');
    if (rendered.branch.headCommitId !== expectedHeadCommitId) {
      throw new Error('The Experiment changed while its scene was being updated.');
    }
    const refusal = sceneDisabledReason();
    if (refusal) throw new Error(refusal);
    const scene = value === undefined ? undefined : {
      ...value,
      ...(value.parameters === undefined ? {} : { parameters:structuredClone(value.parameters) }),
    };
    if (JSON.stringify(scene) === JSON.stringify(rendered.spec.scene)) return rendered;
    const nextSpec = { ...rendered.spec };
    if (scene === undefined) delete nextSpec.scene;
    else nextSpec.scene = scene;
    const nextDocument:ExperimentDocument = { ...rendered,spec:nextSpec };
    if (editing) {
      if (!applyDraft) throw new Error('This dashboard cannot apply scene changes to the Edit draft.');
      applyDraft(nextDocument);
      rememberSaved?.(nextDocument);
      return nextDocument;
    }
    if (!save) throw new Error('This dashboard cannot save scene changes to the Experiment.');
    const saved = await save(nextDocument,reason);
    rememberSaved?.(saved);
    return saved;
  }

  return { update,updateLocalizationOffset,updateWorldBoundary,updateScene,disabledReason,localizationOffsetDisabledReason,sceneDisabledReason };
}
