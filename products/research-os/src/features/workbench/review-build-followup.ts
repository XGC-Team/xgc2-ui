import { notifyManuscriptSourcesSaved } from '../resources/manuscript-build'
import { subscribeReviewBatches, writingBatchSaved } from '../review/review-batches'

/** Follow completed domain batches while this workspace is observed. The save
 * bus owns batch deduplication; this is neither a replay queue nor a source writer.
 * A partial batch can contain real saves alongside refused/uncertain attempts.
 */
export function subscribeProjectReviewBuilds(workspace: string): () => void {
  return subscribeReviewBatches(receipt => {
    if (receipt.scope.workspace !== workspace) return
    const saved = writingBatchSaved(receipt)
    if (!saved) return
    const changes = saved.changes.filter(change => /\.(tex|bib|sty|cls|bst|cfg|def)$/i.test(change.path))
    if (changes.length) notifyManuscriptSourcesSaved({ ...saved, changes })
  })
}
