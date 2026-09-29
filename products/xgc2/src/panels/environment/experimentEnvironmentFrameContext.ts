import { createContext,useContext } from 'react';

export type ExperimentEnvironmentView = 'files' | 'terminal' | 'network';

export type ExperimentEnvironmentFrame = {
  view: ExperimentEnvironmentView;
  setView: (view: ExperimentEnvironmentView) => void;
  operationsOpen: boolean;
  setOperationsOpen: (open: boolean) => void;
};

export const ExperimentEnvironmentFrameContext = createContext<ExperimentEnvironmentFrame | null>(null);

export function isExperimentEnvironmentView(value: unknown): value is ExperimentEnvironmentView {
  return value === 'files' || value === 'terminal' || value === 'network';
}

export function useExperimentEnvironmentFrame(): ExperimentEnvironmentFrame {
  const frame = useContext(ExperimentEnvironmentFrameContext);
  if (!frame) throw new Error('Experiment environment frame is not mounted');
  return frame;
}
