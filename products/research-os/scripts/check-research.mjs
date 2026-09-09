// Real Research API and Git, isolated in a temporary data root. No production records are created.
import {chromium} from 'playwright'
import {createServer} from 'vite'
import {spawn,execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir,homedir} from 'node:os'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=resolve(import.meta.dirname,'..'),harness=resolve(process.env.XGC_HARNESS_ROOT||resolve(root,'../../../../../..')),research=join(harness,'devops/platforms/research-os')
const identity=createHash('sha256').update(harness).digest('hex').slice(0,16)
const binary=process.env.RESEARCH_TEST_BINARY||join(homedir(),'.local/state/xgc2/research-os',identity,'researchd')
if(!existsSync(binary))throw Error('Set RESEARCH_TEST_BINARY to a built researchd binary')
const data=mkdtempSync(join(tmpdir(),'research-ui-integration-'))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('RESEARCH_OS_')))
const academic=join(data,'academic');mkdirSync(join(academic,'memory/now'),{recursive:true});mkdirSync(join(academic,'memory/ontology'),{recursive:true});mkdirSync(join(academic,'project/paper-verification'),{recursive:true})
writeFileSync(join(academic,'memory/now.md'),'# Academic test map\n\n[[evidence]]\n')
writeFileSync(join(academic,'memory/now/evidence.md'),'# Arithmetic source\n\n[[now]]\n\nValues: 2, 4, 6.\n')
for(const cwd of [academic,join(academic,'project/paper-verification')]){execFileSync('git',['init'],{cwd,stdio:'pipe'});writeFileSync(join(cwd,'README.md'),'# Integration repository\n');execFileSync('git',['add','README.md'],{cwd});execFileSync('git',['-c','user.name=UI verification','-c','user.email=ui-verification@localhost','commit','-m','Initial evidence'],{cwd,stdio:'pipe'})}
Object.assign(env,{RESEARCH_OS_ACADEMIC_ROOT:academic,RESEARCH_OS_DATA_ROOT:data,RESEARCH_OS_GO_ADDR:'127.0.0.1:3215',RESEARCH_OS_BROWSER_ALLOWED_PORTS:'3215,5175'})
const api=spawn(binary,[],{cwd:research,env,stdio:['ignore','ignore','pipe']});let backendErrors='';api.stderr.on('data',c=>backendErrors+=c.toString())
let server,browser,page
const base='http://localhost:5175'
const apiRequest=async(path,body)=>{const r=await fetch(base+'/api/v1'+path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();assert.ok(r.ok,JSON.stringify(b));return b.data}
try {
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:3215/api/v1/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error(backendErrors)}
 server=await createServer({root,configFile:join(root,'vite.config.ts'),cacheDir:join(data,'vite-cache'),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3215',changeOrigin:false,ws:true}}}});await server.listen()
 await apiRequest('/workspaces',{workspaceId:'verification'})
 const workspace=join(data,'workspaces/verification');writeFileSync(join(workspace,'evidence.txt'),'2\n4\n6\n')
 for(const args of [['add','evidence.txt'],['-c','user.name=UI verification','-c','user.email=ui-verification@localhost','commit','-m','Add verification evidence']])execFileSync('git',args,{cwd:workspace,stdio:'pipe'})
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:workspace,encoding:'utf8'}).trim()
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
 page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await page.getByRole('heading',{name:'有什么想研究的？'}).waitFor()
 assert.equal(await page.getByRole('navigation',{name:'主导航'}).getByRole('button').count(),5)
 await page.getByRole('button',{name:'paper-verification',exact:true}).click()
 const nav=async name=>{await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true}).click()}
 await nav('Knowledge');await page.getByRole('button',{name:'新笔记',exact:true}).click();await page.getByRole('textbox',{name:'标题',exact:true}).fill('Arithmetic evidence');await page.getByRole('textbox',{name:'笔记',exact:true}).fill('The values 2, 4, 6 have mean 4.');await page.getByRole('button',{name:'保存笔记',exact:true}).click();await page.getByRole('button',{name:'Arithmetic evidence',exact:true}).click();await page.getByText('The values 2, 4, 6 have mean 4.',{exact:true}).waitFor()
 console.log('PASS project creation and persisted knowledge')
 await nav('Graph');await page.getByRole('button',{name:'Arithmetic source',exact:true}).click();await page.getByText('academic/memory/now/evidence.md',{exact:true}).waitFor();assert.ok((await page.locator('main').innerText()).includes('2 篇 · 1 条链接'));console.log('PASS real academic repository graph and source text')
 await nav('Files');await page.getByRole('combobox',{name:'研究工作区'}).selectOption('verification');await page.getByRole('button',{name:'evidence.txt',exact:true}).click();await page.locator('pre').filter({hasText:'2\n4\n6'}).waitFor();console.log('PASS Git workspace file read')
 await nav('Workflow');await page.getByRole('button',{name:'创建计划',exact:true}).click();await page.getByRole('textbox',{name:'计划名称',exact:true}).fill('Verify the arithmetic');await page.getByRole('textbox',{name:'研究目标',exact:true}).fill('Verify mean 4 from evidence.txt and report source.');await page.getByLabel('工作区',{exact:true}).selectOption('verification');await page.getByLabel('已审阅 Git commit',{exact:true}).fill(head)
 for(const name of ['研究员','独立审查','写作'])await page.getByLabel(name,{exact:true}).selectOption('codex')
 await page.getByRole('button',{name:'编辑步骤：证据研究',exact:true}).click();await page.getByRole('textbox',{name:'任务',exact:true}).fill('Read evidence.txt. Compute the arithmetic mean of 2, 4, 6. Report result 4 with reproducible arithmetic. Do not modify files.');await page.getByRole('textbox',{name:'证据输入（每行一个版本引用）',exact:true}).fill('evidence.txt@'+head);await page.getByRole('button',{name:'保存新版本',exact:true}).click();await page.getByRole('heading',{name:'Verify the arithmetic',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'批准版本 1',exact:true}).isEnabled(),false)
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 PlanWeave',exact:true}).click();const download=await downloadPromise;await download.saveAs(join(data,'planweave.json'));console.log('PASS plan version save, approval gate and PlanWeave export')
 await page.screenshot({path:join(data,'workflow.png')});await page.reload();await page.getByRole('button',{name:'paper-verification',exact:true}).click();await nav('Workflow');await page.getByRole('heading',{name:'Verify the arithmetic',exact:true}).waitFor();console.log('PASS reload persistence')
 await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.setViewportSize({width:1000,height:760});await page.screenshot({path:join(data,'workflow-dark.png')})
 if(process.env.RESEARCH_TEST_NATIVE==='1'){
   await page.getByRole('button',{name:'paper-verification',exact:true}).click();await page.locator('[contenteditable="true"]').waitFor();
   const editor=page.locator('[contenteditable="true"]').first();await editor.fill('Reply exactly UI_STREAM_OK. Do not call any tools or edit files.');await page.getByRole('button',{name:'Send message',exact:true}).click({timeout:60000});await page.getByText('UI_STREAM_OK',{exact:true}).waitFor({timeout:90000});await page.screenshot({path:join(data,'chat-stream.png')});console.log('PASS actual native model prompt and streamed response')
   await page.getByRole('button',{name:/^重命名 /}).first().click();await page.getByRole('textbox',{name:'线程名称'}).fill('Stream verification');await page.getByRole('button',{name:'保存线程名称',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).waitFor();await page.getByRole('button',{name:'归档线程',exact:true}).click();await page.getByRole('button',{name:'THREADS',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).waitFor();await page.getByRole('button',{name:'恢复线程',exact:true}).click();await page.getByRole('button',{name:'ARCHIVED THREADS',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).click();console.log('PASS thread rename, archive and restore');await page.locator('[contenteditable="true"]').first().fill('Reply exactly UI_RESUME_OK. Do not call tools or edit files.');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('UI_RESUME_OK',{exact:true}).waitFor({timeout:90000});console.log('PASS send resumes restored native thread')
   const sessionData=await apiRequest('/native-agents/sessions');const thread=sessionData.sessions.find(s=>s.scope.context.kind==='research-repository');assert.equal(thread.scope.workspace.id,'paper-verification');assert.equal(thread.scope.workspace.revision,'working-tree');console.log('PASS paper repository thread scope')
   await nav('Workflow');await page.getByRole('checkbox',{name:'批准此版本，并允许三个原生 Agent 访问该工作区副本'}).check();await page.getByRole('button',{name:'批准版本 1',exact:true}).click();await page.getByRole('button',{name:'开始研究、验证与写作',exact:true}).click();
   await page.getByRole('button',{name:'处理审批',exact:true}).waitFor({timeout:60000});await page.getByRole('button',{name:'处理审批',exact:true}).click();
   await page.locator('.native-chat-host').getByText(/Native operation approval|运行命令|执行命令|operation approval/).first().waitFor({timeout:15000});
   await nav('Workflow');await page.getByRole('button',{name:'停止运行',exact:true}).first().click();await page.getByRole('heading',{name:'运行 · cancelled',exact:true}).waitFor({timeout:15000});
   await page.screenshot({path:join(data,'workflow-cancelled.png')});console.log('PASS actual workflow launch, approval navigation and cancellation; three-stage completion not asserted')
 }
 await page.getByRole('button',{name:'打开终端',exact:true}).click();await page.locator('.xterm-helper-textarea').waitFor();await page.locator('.xterm-helper-textarea').fill("printf '\\nTERMINAL_%s\\n' VERIFIED; pwd");await page.locator('.xterm-helper-textarea').press('Enter');await page.locator('.xterm-screen').getByText('TERMINAL_VERIFIED',{exact:true}).waitFor();console.log('PASS real browser PTY shell')
 await page.getByRole('button',{name:'关闭终端 1',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('[data-xgc-role="native-provider-settings"]').waitFor();assert.equal(await page.getByText('OpenCode',{exact:true}).count(),1);console.log('PASS shared native provider settings')
 assert.deepEqual(errors,[]);console.log('PASS no browser runtime exceptions');console.log('Artifacts:',data)
} catch(error) {
 if(page){await page.screenshot({path:join(data,'failure.png')}).catch(()=>{});console.log('Failure screen:',(await page.locator('body').innerText()).slice(-3500))}
 console.log('Failure artifacts:',data);throw error
} finally {
 if(browser)await browser.close();if(server)await server.close();api.kill('SIGTERM')
}
