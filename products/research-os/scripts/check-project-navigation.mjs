import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(process.env.RESEARCH_UI_URL||'http://localhost:5173')
 const nav=page.getByRole('navigation',{name:'顶层菜单'})
 await nav.getByRole('button',{name:'知识库',exact:true}).waitFor()
 assert.equal(await nav.getByRole('button',{name:'文件',exact:true}).count(),0)
 await page.getByRole('button',{name:'项目文件 · paper-dmpc',exact:true}).click()
 const files=page.getByRole('region',{name:'右侧面板'})
 await files.getByRole('button',{name:'manuscript',exact:true}).waitFor()
 // The explorer shows the repository root directly: no repository picker combobox.
 assert.equal(await files.getByRole('combobox').count(),0)
 await files.getByRole('button',{name:'manuscript',exact:true}).click()
 await files.getByRole('button',{name:'上级目录',exact:true}).waitFor()
 await page.getByRole('button',{name:'项目文件 · paper-koopman',exact:true}).click()
 await files.getByRole('button',{name:'manuscript',exact:true}).waitFor()
 assert.equal(await files.getByRole('button',{name:'上级目录',exact:true}).count(),0)
 await nav.getByRole('button',{name:'知识库',exact:true}).click()
 await page.getByRole('tree',{name:'知识库文件'}).getByRole('treeitem').first().waitFor()
 const file=page.getByRole('tree',{name:'知识库文件'}).getByRole('button').filter({hasText:/\.md/}).first()
 const filename=await file.innerText();await file.click()
 // The knowledge reader opens in the main surface, not the right panel.
 await page.locator('main .research-document').waitFor()
 await page.waitForFunction(()=>{const p=document.querySelector('main .research-document');return p&&p.textContent.trim()&&!p.textContent.includes('正在读取…')})
 // The graph is the knowledge home; the reader's return action brings it back. The file tree is persistent.
 await page.getByRole('button',{name:'图谱',exact:true}).first().click()
 await page.locator('canvas[aria-label="知识图谱画布"]').waitFor()
 await page.locator('main .research-document').waitFor({state:'hidden'})
 await page.getByRole('tree',{name:'知识库文件'}).waitFor()
 await page.screenshot({path:'/tmp/research-global-graph.png'})
 assert.deepEqual(errors,[])
 console.log('PASS global knowledge/graph, real file tree and reader, project sidebar files, project switching, no repository picker or source directories',filename)
}finally{await browser.close()}
