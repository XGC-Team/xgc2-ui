// Read-only PDF/navigation validation; restoring an idle worker sends no prompt.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const b=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'}),p=await b.newPage({viewport:{width:1600,height:1000}});const errors=[],prompts=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/prompts'))prompts.push(r.url())})
try{
 await p.goto('http://localhost:5173');await p.getByRole('button',{name:'paper-temp',exact:true}).click();await p.getByRole('button',{name:'模板验证 · 写作与 PDF 批注',exact:true}).click();await p.getByRole('tab',{name:'PDF',exact:true}).click();await p.locator('.research-pdf-text span').first().waitFor()
 const note=p.locator('[data-xgc-role="pdf-annotation-mark"][title="请调整这个公式与前后正文的间距，并保持公式编号右对齐。"]');await note.waitFor();await note.click();await p.getByText('区域批注',{exact:true}).waitFor();await p.getByRole('button',{name:'按此批注修改',exact:true}).click();const draft=await p.locator('[data-xgc-role="native-agent-composer-input-editor"]').innerText();assert.ok(draft.includes('定位方式：region'));assert.ok(draft.includes('PDF 区域'))
 await p.getByRole('button',{name:'展开或还原右栏宽度',exact:true}).click();await p.waitForTimeout(700);await p.screenshot({path:'artifacts/pdf-inline-20260908/inline-region.png'})
 await p.getByRole('button',{name:'关闭批注',exact:true}).click();await p.getByRole('button',{name:'PDF 操作',exact:true}).click();const versions=p.getByRole('combobox',{name:'PDF 版本',exact:true});const ids=await versions.locator('option').evaluateAll(els=>els.map(el=>el.value));assert.ok(ids.length>=2);await versions.selectOption(ids.at(-1));await p.keyboard.press('Escape');await p.waitForTimeout(600);assert.equal(await p.locator('[data-xgc-role="pdf-annotation-mark"]').count(),0)
 await p.getByRole('button',{name:'PDF 操作',exact:true}).click();await p.getByRole('combobox',{name:'PDF 版本',exact:true}).selectOption(ids[0]);await p.keyboard.press('Escape');await note.waitFor()
 await p.getByRole('tab',{name:'项目文件',exact:true}).click();await p.getByRole('button',{name:'manuscript',exact:true}).click();await p.getByRole('button',{name:'main.tex',exact:true}).click();await p.getByRole('button',{name:'编译 PDF',exact:true}).waitFor();assert.equal(await p.locator('[data-right-toolbar]').getByRole('button',{name:'编译 PDF',exact:true}).count(),1)
 await p.getByRole('tab',{name:'阅读',exact:true}).click();assert.equal(await p.locator('[data-right-toolbar]').getByRole('textbox',{name:'搜索学术笔记',exact:true}).count(),1)
 await p.getByRole('tab',{name:'浏览器',exact:true}).click();assert.equal(await p.locator('[data-right-toolbar]').getByRole('textbox',{name:'网页地址',exact:true}).count(),1)
 await p.getByRole('tab',{name:'PDF',exact:true}).click();await note.waitFor()
 await p.locator('[data-xgc-role="chat-connection-status"]').click();const resume=p.getByRole('button',{name:'恢复会话',exact:true});if(await resume.count()){await resume.click();await p.getByText('消息流已连接。',{exact:true}).waitFor({timeout:30000})}await p.keyboard.press('Escape')
 assert.deepEqual(prompts,[]);assert.deepEqual(errors,[]);console.log('PASS saved region, precise draft, version isolation, one shared toolbar for all views, worker restored without resending prompts')
}finally{await b.close()}
