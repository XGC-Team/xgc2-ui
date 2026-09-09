// Saves two paper-temp review examples only when absent; never sends a model prompt.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto('http://localhost:5173');await page.getByRole('button',{name:'paper-temp',exact:true}).click();await page.getByRole('button',{name:'模板验证 · 写作与 PDF 批注',exact:true}).click();await page.getByRole('tab',{name:'PDF',exact:true}).click();await page.locator('.research-pdf-text span').first().waitFor()
 assert.equal(await page.locator('[data-right-toolbar]').count(),1)
 const toolbar=await page.locator('[data-right-toolbar]').boundingBox(),viewport=await page.locator('[data-xgc-role="pdf-viewport"]').boundingBox();assert.ok(Math.abs(viewport.y-toolbar.y-toolbar.height)<2)
 assert.equal(await page.locator('[data-xgc-role="pdf-annotation-comment"]').count(),0)
 await page.locator('[data-xgc-role="chat-connection-status"]').click();await page.getByText('服务曾停止或重启，会话需要恢复；历史消息已保留。',{exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('section[aria-label="聊天"] .ui-error').count(),0)
 await page.getByRole('button',{name:'展开或还原右栏宽度',exact:true}).click();await page.waitForTimeout(800)
 const selected=await page.locator('.research-pdf-text').evaluate(el=>{const span=Array.from(el.querySelectorAll('span')).find(s=>s.textContent.includes('This file'));if(!span)throw Error('Text missing');const range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);return span.textContent})
 if(!await page.locator('[data-xgc-role="pdf-annotation-mark"][title="请明确说明：三个样本不足以推断总体分布。"]').count()){
 await page.locator('[data-xgc-role="pdf-page"]').dispatchEvent('mouseup')
 await page.locator('[data-xgc-role="pdf-annotation-comment"]').fill('请明确说明：三个样本不足以推断总体分布。')
 const saved=page.waitForResponse(r=>r.url().includes('/knowledge-items')&&r.request().method()==='POST'&&r.status()<300)
 await page.getByRole('button',{name:'保存批注',exact:true}).click();await saved
 }
 const mark=page.locator('[data-xgc-role="pdf-annotation-mark"]').last();await mark.waitFor();await mark.click();await page.getByText('请明确说明：三个样本不足以推断总体分布。',{exact:true}).waitFor()
 const original=await mark.evaluate(el=>({left:el.style.left,top:el.style.top,width:el.style.width}))
 await page.getByRole('button',{name:'关闭批注',exact:true}).click();await page.getByRole('button',{name:'PDF 操作',exact:true}).click();await page.getByRole('button',{name:'放大 PDF',exact:true}).click();await page.keyboard.press('Escape');assert.deepEqual(await mark.evaluate(el=>({left:el.style.left,top:el.style.top,width:el.style.width})),original)
 await mark.click();await page.getByRole('button',{name:'按此批注修改',exact:true}).click()
 const draft=await page.locator('[data-xgc-role="native-agent-composer-input-editor"]').innerText();assert.ok(draft.includes(selected));assert.ok(draft.includes('PDF 区域'));assert.ok(draft.includes('构建：'))
 await page.getByRole('button',{name:'关闭批注',exact:true}).click()
 const regionNote=page.locator('[data-xgc-role="pdf-annotation-mark"][title="请调整这个公式与前后正文的间距，并保持公式编号右对齐。"]')
 if(!await regionNote.count()){
 await page.getByRole('button',{name:'框选批注',exact:true}).click()
 const area=page.locator('[data-xgc-role="pdf-region-selector"]'),r=await area.boundingBox();await page.mouse.move(r.x+r.width*.2,r.y+r.height*.51);await page.mouse.down();await page.mouse.move(r.x+r.width*.82,r.y+r.height*.58,{steps:8});await page.mouse.up()
 await page.locator('[data-xgc-role="pdf-annotation-comment"]').fill('请调整这个公式与前后正文的间距，并保持公式编号右对齐。')
 const savedRegion=page.waitForResponse(r=>r.url().includes('/knowledge-items')&&r.request().method()==='POST'&&r.status()<300)
 await page.getByRole('button',{name:'保存批注',exact:true}).click();await savedRegion;await page.waitForTimeout(300)
 await page.getByRole('button',{name:'文字批注',exact:true}).click()
 }
 await regionNote.click();await page.getByText('区域批注',{exact:true}).waitFor()
 fs.mkdirSync('artifacts/pdf-inline-20260908',{recursive:true});await page.screenshot({path:'artifacts/pdf-inline-20260908/inline-region.png'})
 assert.deepEqual(errors,[]);console.log('PASS single header, connection explanation, inline text annotation, region annotation, save/reopen, normalized zoom and precise chat draft (no prompt sent)')
}finally{await browser.close()}
