import assert from 'node:assert/strict'
import {chromium} from 'playwright'
// Uses the real rendered frontend with explicit test fixtures. It is NOT a real-backend acceptance receipt.
const url=process.env.RESEARCH_UI_URL,project=process.env.RESEARCH_TEST_PROJECT
assert.ok(url,'Set RESEARCH_UI_URL to an already running actual Research OS UI.')
assert.match(project||'',/^paper-e2e-[a-z0-9-]+$/,'Use a registered dedicated paper-e2e-* project.')
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],blocked=[],writes=[]
page.on('pageerror',e=>errors.push(e.message))
await context.addInitScript(project=>{localStorage.setItem('research-ui-project',project);localStorage.setItem('research-ui-locale','en');localStorage.setItem('research-ui-bottom','collapsed')},project)
const original='A strong conclusion.',files=new Map([['main.tex',{content:original,digest:'source-v1'}]])
let serial=1
const pdfText='BT /F1 12 Tf 50 750 Td (A strong conclusion.) Tj ET'
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdf='%PDF-1.4\n',offsets=[0]
objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`})
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const build={task:{workspaceRef:project,entryPoint:'main.tex',gitCommit:'test-commit',inputs:[{path:'main.tex',digest:'source-v1'}]},manifest:{buildId:'f3-test-build',completedAt:'2026-09-16T04:00:00Z',status:'succeeded',diagnostics:[],outputs:[{digest:'pdf-v1',mediaType:'application/pdf'}]}}
let builds=[build]
await context.route('**/api/v1/**',async route=>{
 const request=route.request(),u=new URL(request.url()),path=decodeURIComponent(u.pathname),base=`/api/v1/workspaces/${project}/files`
 const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 if(path==='/api/v1/manuscripts/build-records'&&u.searchParams.get('manuscriptId')===project)return reply(200,{data:builds})
 if(path==='/api/v1/manuscripts/build-records/f3-test-build/artifacts/pdf-v1')return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from(pdf)})
 if(path===base&&request.method()==='GET')return reply(200,{data:[{kind:'file',path:'main.tex',sizeBytes:original.length}],meta:{directory:'',nextCursor:null}})
 if(path.startsWith(base+'/')){
  const name=path.slice(base.length+1),record=files.get(name)
  if(request.method()==='GET')return record?reply(200,{data:record}):reply(404,{error:{message:'Missing fixture file'}})
  if(request.method()==='PUT'&&['main.tex','research-reviews.json'].includes(name)){
   const input=request.postDataJSON();if(input.createOnly?!!record:input.expectedDigest!==record?.digest)return reply(409,{error:{message:'Fixture CAS conflict'}})
   const r={content:input.content,digest:`fixture-${++serial}`};files.set(name,r);writes.push(name);return reply(200,{data:{digest:r.digest}})
  }
 }
 if(!['GET','HEAD','OPTIONS'].includes(request.method())){blocked.push(`${request.method()} ${path}`);return route.abort('blockedbyclient')}
 return route.continue()
})
const review=page.locator(`[data-review-project="${project}"]`),objectsNav=page.locator(`[data-project-objects="${project}"]`)
try{
 await page.goto(url)
 await objectsNav.locator('[data-project-object="builds"]').click()
 await page.locator('.rtab-panel:visible').getByRole('button',{name:'main.tex · PDF',exact:true}).click()
 const reader=page.locator('[data-xgc-role="pdf-reader"]')
 await reader.locator('.research-pdf-text span').first().waitFor()
 const capture=async()=>{
  await reader.locator('.research-pdf-text').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange'))})
  await reader.locator('[data-xgc-role="pdf-page"]').dispatchEvent('mouseup')
  await reader.locator('[data-xgc-role="pdf-annotation-editor"] textarea').fill('The evidence supports only specific conditions.')
  await page.locator('.rtab-panel:visible').getByRole('button',{name:'Feedback and proposal',exact:true}).click()
 }
 await capture()
 await review.getByLabel('Proposal title',{exact:true}).fill('F3 conditional claim')
 await review.getByLabel('Target relative path (explicit confirmation required)',{exact:true}).fill('main.tex')
 await review.getByRole('button',{name:'Load baseline',exact:true}).click()
 await review.getByLabel('Select the exact range in raw text',{exact:true}).evaluate(el=>{el.focus();el.setSelectionRange(0,'A strong conclusion.'.length);el.dispatchEvent(new Event('select',{bubbles:true}))})
 await review.getByLabel('After (complete value of this field)',{exact:true}).fill('A conditional conclusion.')
 await review.getByLabel('Rationale and evidence explanation',{exact:true}).fill('Narrow scope to the measured conditions.')
 await review.getByRole('button',{name:'Add operation for review',exact:true}).click()
 await review.getByRole('button',{name:'Save proposal for review (do not apply)',exact:true}).click()
 await review.locator('[data-review-operation]').waitFor()
 assert.equal(writes.filter(x=>x==='main.tex').length,0)
 await review.locator('[data-review-operation] input[type=checkbox]').check()
 await review.getByRole('button',{name:'Validate preview (no writes)',exact:true}).click()
 await review.getByText('Preview only; no target file was written',{exact:false}).waitFor()
 assert.equal(writes.filter(x=>x==='main.tex').length,0)
 files.set('main.tex',{content:'Human edited the baseline.\n'+original,digest:'human-v2'})
 page.once('dialog',d=>d.accept())
 await review.getByRole('button',{name:'Apply selected scope',exact:true}).click()
 await review.getByRole('alert').filter({hasText:'Baseline conflict'}).waitFor()
 assert.equal(writes.filter(x=>x==='main.tex').length,0)
 await review.getByLabel('Rejection reason',{exact:true}).fill('Recompose against current source.')
 await review.getByRole('button',{name:'Reject selected group',exact:true}).click()
 await review.getByText('Rejected',{exact:true}).waitFor()
 const saved=JSON.parse(files.get('research-reviews.json').content)
 assert.equal(saved.proposals[0].feedback.anchor.kind,'pdf');assert.equal(saved.proposals[0].feedback.anchor.buildId,'f3-test-build')
 assert.equal(saved.decisions.length,1)
 builds=[{...build,manifest:{buildId:'f3-test-failed',completedAt:'2026-09-16T05:00:00Z',status:'failed',diagnostics:[{message:'Fixture compile failed'}],outputs:[]}},build]
 await objectsNav.locator('[data-project-object="builds"]').click()
 await page.locator('.rtab-panel:visible').getByRole('button',{name:'main.tex · PDF',exact:true}).click()
 const provenance=page.locator('[data-review-build="f3-test-build"]')
 await provenance.locator('summary').click();await provenance.getByRole('button',{name:'Refresh receipts',exact:true}).click()
 await provenance.getByText('A later build failed. This is the previous successful preview; it has not been replaced.',{exact:true}).waitFor()
 await page.reload();await objectsNav.locator('[data-project-object="reviews"]').click()
 await review.getByRole('button',{name:'F3 conditional claim',exact:true}).click();await review.getByText('Rejected',{exact:true}).waitFor()
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[])
 console.log('PASS rendered fixture path: PDF feedback, versioned proposal, preview/write separation, baseline conflict, rejection, retained failed-build preview and journal reopen. Real-service acceptance remains separate.')
}finally{await context.close();await browser.close()}
