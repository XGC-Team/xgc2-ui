import { APIError, post } from '../../lib/api'
import { parseResultBundle, parseVerificationPlan, type ResultBundle, type ResultInspection, type ResultUse, type SessionObservation, type VerificationPlan } from './experiment-model'

export async function captureSession(stationId: string, targetId: string, sessionId: string): Promise<SessionObservation> {
  return post<SessionObservation>('/xgc2/session-references', { stationId, targetId, sessionId })
}

export async function inspectResult(plan: VerificationPlan, bundle: ResultBundle): Promise<ResultInspection> {
  try {
    return await post<ResultInspection>('/experiments/result-inspections', { plan, bundle })
  } catch (error) {
    if (error instanceof APIError && error.status === 501) {
      throw new Error('Original-byte inspection is not configured. The archive owner (Record/Documents) has not registered a resolver. Opening this page did not start an experiment.')
    }
    throw error
  }
}

export async function listAffectedUses(bundle: ResultBundle, latest: Record<string, string>): Promise<ResultUse[]> {
  return post<ResultUse[]>('/experiments/affected-uses', { bundle, latest })
}

export function parsePlanFile(text: string): VerificationPlan { return parseVerificationPlan(text) }
export function parseBundleFile(text: string, projectId: string, workspace: string): ResultBundle {
  return parseResultBundle(text, { projectId, workspace })
}
