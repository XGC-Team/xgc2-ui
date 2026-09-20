import type { ManuscriptPDF } from '../resources/manuscript'

export function canAdvancePreview(current: ManuscriptPDF, candidate: ManuscriptPDF | null, following: boolean, dirty: boolean): candidate is ManuscriptPDF {
  return Boolean(following && !dirty && candidate
    && candidate.workspace === current.workspace && candidate.path === current.path
    && (candidate.buildId !== current.buildId || candidate.digest !== current.digest))
}
