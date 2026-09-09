// Read-only check against the retained paper-temp validation conversation.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(process.env.RESEARCH_UI_URL||'http://localhost:5173');await page.getByRole('button',{name:'paper-temp',exact:true}).click();await page.getByRole('button',{name:'模板验证 · 写作与 PDF 批注',exact:true}).click()
 const scroll=page.locator('.native-chat-host .scrollbar-gutter-both');await scroll.waitFor();await page.waitForTimeout(1500)
 await page.waitForFunction(()=>{const s=document.querySelector('.native-chat-host .scrollbar-gutter-both');return s&&s.scrollHeight-s.clientHeight-s.scrollTop<5})
 const end=await scroll.evaluate(el=>el.scrollTop);assert.ok(end>0)
 await scroll.hover();await page.mouse.wheel(0,-450);await page.waitForTimeout(400);const before=await scroll.evaluate(el=>el.scrollTop);assert.ok(before<end-200)
 await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.waitForTimeout(300);assert.ok(Math.abs((await scroll.evaluate(el=>el.scrollTop))-before)<30,'Theme change should not move a reader back to the latest message')
 await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'知识库',exact:true}).click();await page.getByRole('button',{name:'paper-temp',exact:true}).click();await scroll.waitFor();await page.waitForTimeout(400)
 assert.ok(Math.abs((await scroll.evaluate(el=>el.scrollTop))-before)<80,'Returning to chat should preserve the reading position')
 await page.getByRole('button',{name:'切换主题',exact:true}).click()
 await page.getByRole('tab',{name:'PDF',exact:true}).click();await page.locator('.research-pdf-text span').first().waitFor({timeout:15000});assert.ok((await page.locator('.research-pdf-text').innerText()).replace(/\s+/g,' ').includes('cannot establish the population distribution'))
 await page.getByRole('button',{name:'展开或还原右栏宽度',exact:true}).click();await page.waitForTimeout(500);const width=await page.locator('main').evaluate(el=>el.clientWidth);assert.ok(width>=479)
 await page.screenshot({path:'artifacts/paper-temp-20260908/workbench-fixed.png'})
 assert.equal(await page.getByRole('region',{name:'下栏'}).evaluate(el=>el.getBoundingClientRect().height),40)
 await page.getByRole('tab',{name:'终端',exact:true}).click();await page.getByRole('button',{name:'打开终端',exact:true}).waitFor();await page.getByRole('button',{name:'收起下栏',exact:true}).click()
 assert.deepEqual(errors,[]);console.log('PASS history scroll anchoring, theme/navigation retention, automatic project PDF, constrained right sidebar and bottom panel controls')
}finally{await browser.close()}
