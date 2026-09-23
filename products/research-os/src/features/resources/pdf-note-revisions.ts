import {decodeAnnotation} from './pdf-annotations'
import {isOriginalPDF,type ReadablePDF} from './manuscript'

export type ReadingRevision={id:string;body:string;authorRef:string;createdAt:string}

/** An explicit project attachment chooses a revision; an unlinked item head cannot replace it.
 * Keep historical PDF notes visible on their own PDF, while a corrected attachment supersedes
 * the same item's older annotation on the same PDF. All revisions remain in knowledge history.
 */
export function attachedPDFRevision(revisions:ReadingRevision[],attached:ReadonlySet<string>,pdf:ReadablePDF):ReadingRevision|undefined {
  const prefix=`pdf:${pdf.workspace}:${pdf.digest}:`
  return revisions.filter(revision=>{
    if(!attached.has(revision.id)||!revision.authorRef?.startsWith(prefix))return false
    const recorded=decodeAnnotation(revision.body).anchor?.pdf
    if(recorded&&(recorded.workspace!==pdf.workspace||recorded.path!==pdf.path||recorded.digest!==pdf.digest))return false
    return !isOriginalPDF(pdf)||recorded?.origin==='original'
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]
}
