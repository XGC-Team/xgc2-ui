// Real Research API and Git, isolated in a temporary data root. No production records are created.
import {chromium} from 'playwright'
import {createServer} from 'vite'
import {spawn,execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir,homedir} from 'node:os'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=resolve(import.meta.dirname,'..'),harness=resolve(process.env.XGC_HARNESS_ROOT||resolve(root,'../../../../../..'))
const research=resolve(process.env.RESEARCH_OS_BACKEND_ROOT||join(harness,'devops/platforms/research-os'))
const identity=createHash('sha256').update(harness).digest('hex').slice(0,16)
const binary=process.env.RESEARCH_TEST_BINARY||join(homedir(),'.local/state/xgc2/research-os',identity,'researchd')
if(!existsSync(binary))throw Error('Set RESEARCH_TEST_BINARY to a built researchd binary')
const artifacts=resolve(process.env.RESEARCH_TEST_ARTIFACTS||tmpdir())
mkdirSync(artifacts,{recursive:true})
const data=mkdtempSync(join(artifacts,'research-ui-integration-'))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('RESEARCH_OS_')))
const academic=join(data,'academic');mkdirSync(join(academic,'memory/now'),{recursive:true});mkdirSync(join(academic,'memory/ontology'),{recursive:true});mkdirSync(join(academic,'project/paper-verification'),{recursive:true})
writeFileSync(join(academic,'memory/now.md'),'# Academic test map\n\n[[evidence]]\n')
writeFileSync(join(academic,'memory/now/evidence.md'),'# Arithmetic source\n\n[[now]]\n\nValues: 2, 4, 6.\n')
for(const cwd of [academic,join(academic,'project/paper-verification')]){execFileSync('git',['init'],{cwd,stdio:'pipe'});writeFileSync(join(cwd,'README.md'),'# Integration repository\n');execFileSync('git',['add','README.md'],{cwd});execFileSync('git',['-c','user.name=UI verification','-c','user.email=ui-verification@localhost','commit','-m','Initial evidence'],{cwd,stdio:'pipe'})}
Object.assign(env,{RESEARCH_OS_ACADEMIC_ROOT:academic,RESEARCH_OS_DATA_ROOT:data,RESEARCH_OS_GO_ADDR:'127.0.0.1:3215',RESEARCH_OS_BROWSER_ALLOWED_PORTS:'3215,5175',RESEARCH_OS_NATIVE_AGENTS_CONFIG:join(data,'native-agents.json')})
const api=spawn(binary,[],{cwd:research,env,stdio:['ignore','ignore','pipe']});let backendErrors='';api.stderr.on('data',c=>backendErrors+=c.toString())
let server,browser,page
const base='http://localhost:5175'
const apiRequest=async(path,body)=>{const r=await fetch(base+'/api/v1'+path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-XGC-Native-Client':'1'},body:JSON.stringify(body)});const b=await r.json();assert.ok(r.ok,JSON.stringify(b));return b.data}
try {
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:3215/api/v1/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error(backendErrors)}
 server=await createServer({root,configFile:join(root,'vite.config.ts'),cacheDir:join(data,'vite-cache'),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3215',changeOrigin:false,ws:true}}}});await server.listen()
 // Register the installed adapter through its real settings contract in this test's own file.
 // Version, binary digest and login discovery are performed by the backend; no model turn is run here.
 const settings=await apiRequest('/native-agents/settings')
 const configured=await apiRequest('/native-agents/settings',{revision:settings.revision,provider:{id:'codex',provider:'codex',enabled:true,binaryPath:process.env.RESEARCH_TEST_CODEX_BINARY||'codex',defaults:{}}})
 const provider=configured.providers.find(item=>item.id==='codex')
 assert.ok(provider?.available&&provider.version,'Installed Codex CLI must pass actual binary/version discovery')
 console.log('PASS actual Codex CLI discovery:',provider.version,'native login:',provider.login.status)
 if(process.env.RESEARCH_TEST_NATIVE==='1')assert.equal(provider.login.status,'authenticated','Native model checks require an existing CLI login')
 const profiles=await apiRequest('/native-agents/providers')
 assert.ok(profiles.some(item=>item.id===provider.id&&item.available),'Registered adapter must be usable by the workflow')
 const workspace=join(academic,'project/paper-verification');writeFileSync(join(workspace,'evidence.txt'),'2\n4\n6\n')
 for(const args of [['add','evidence.txt'],['-c','user.name=UI verification','-c','user.email=ui-verification@localhost','commit','-m','Add verification evidence']])execFileSync('git',args,{cwd:workspace,stdio:'pipe'})
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:workspace,encoding:'utf8'}).trim()
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
 page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await page.getByRole('heading',{name:'继续写作',exact:true}).waitFor()
 const rail=page.getByRole('navigation',{name:'顶层菜单',exact:true})
 assert.equal(await rail.getByRole('button').count(),4)
 const nav=async name=>{await rail.getByRole('button',{name,exact:true}).click()}
 const project=()=>page.getByRole('region',{name:'项目 paper-verification',exact:true})
 const openProject=async()=>{await nav('聊天');await project().getByRole('button',{name:'paper-verification',exact:true}).click()}
 await openProject()
 // Project notes now live in the persisted research-object editor, bound to this repository.
 await project().getByRole('button',{name:'来源笔记',exact:true}).click()
 const notes=page.getByRole('region',{name:'项目研究对象',exact:true})
 const noteText='The values 2, 4, 6 have mean 4.'
 await notes.getByRole('button',{name:'创建草稿',exact:true}).click()
 await notes.getByRole('combobox',{name:/^草稿类型/}).selectOption('note')
 await notes.getByRole('textbox',{name:'草稿名称',exact:true}).fill('Arithmetic evidence')
 await notes.getByRole('button',{name:'创建草稿',exact:true}).click()
 await notes.getByRole('textbox',{name:'阅读笔记与判断（不是已验证知识）',exact:true}).fill(noteText)
 await notes.getByRole('button',{name:'保存',exact:true}).click()
 await page.locator('[data-draft-project="paper-verification"][data-draft-state="saved"]').waitFor()
 await notes.getByRole('button',{name:'重新读取',exact:true}).click()
 await page.locator('[data-draft-project="paper-verification"][data-draft-state="saved"]').waitFor()
 assert.equal(await notes.getByRole('textbox',{name:'阅读笔记与判断（不是已验证知识）',exact:true}).inputValue(),noteText)
 const savedNotes=JSON.parse((await apiRequest('/workspaces/paper-verification/files/research-drafts.json')).content)
 assert.equal(savedNotes.drafts.find(note=>note.title==='Arithmetic evidence').blocks[0].fields.observation,noteText)
 console.log('PASS project note creation, saved file and re-read persistence')
 await nav('知识库')
 await page.getByText('当前完整视图 · 2 节点 / 2 关系',{exact:true}).waitFor()
 await page.getByText('通过列表检查节点',{exact:true}).click()
 await page.getByRole('listbox',{name:'检查知识节点',exact:true}).selectOption({label:'Arithmetic source · note'})
 const inspection=page.getByRole('complementary',{name:'知识关系检查',exact:true})
 await inspection.getByRole('heading',{name:'Arithmetic source',exact:true}).waitFor()
 await inspection.getByRole('heading',{name:'出链 · 1',exact:true}).waitFor()
 await inspection.getByRole('heading',{name:'回链 · 1',exact:true}).waitFor()
 await inspection.getByRole('button',{name:'阅读原文',exact:true}).click()
 await page.getByText('memory/now/evidence.md',{exact:true}).waitFor()
 await page.getByText('Values: 2, 4, 6.',{exact:true}).waitFor()
 console.log('PASS real academic repository graph, both link directions and source text')
 await openProject();await project().getByRole('button',{name:'项目文件 · paper-verification',exact:true}).click()
 const right=page.getByRole('region',{name:'右侧面板',exact:true})
 await right.getByRole('button',{name:'evidence.txt',exact:true}).click()
 await right.locator('pre').filter({hasText:'2\n4\n6'}).waitFor();console.log('PASS Git workspace file read')
 await nav('工作流');await page.getByRole('button',{name:'创建计划',exact:true}).click();await page.getByRole('textbox',{name:'计划名称',exact:true}).fill('Verify the arithmetic');await page.getByRole('textbox',{name:'研究目标',exact:true}).fill('Verify mean 4 from evidence.txt and report source.');await page.getByLabel('工作区',{exact:true}).selectOption('paper-verification');await page.getByLabel('已审阅 Git commit',{exact:true}).fill(head)
 for(const name of ['默认研究者','默认审查者','默认写作者'])await page.getByLabel(name,{exact:true}).selectOption(provider.id)
 await page.getByRole('button',{name:'编辑步骤: 证据研究',exact:true}).click();await page.getByRole('textbox',{name:'任务',exact:true}).fill('Read evidence.txt. Compute the arithmetic mean of 2, 4, 6. Report result 4 with reproducible arithmetic. Do not modify files.');await page.getByRole('textbox',{name:'证据输入（每行一个版本引用）',exact:true}).fill('evidence.txt@'+head);await page.getByRole('button',{name:'保存新版本',exact:true}).click();await page.getByRole('heading',{name:'Verify the arithmetic',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'批准版本 1',exact:true}).isEnabled(),false)
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 PlanWeave',exact:true}).click();const download=await downloadPromise;await download.saveAs(join(data,'planweave.json'));console.log('PASS plan version save, approval gate and PlanWeave export')
 await page.screenshot({path:join(data,'workflow.png')});await page.reload();await openProject();await nav('工作流');await page.getByRole('heading',{name:'Verify the arithmetic',exact:true}).waitFor();console.log('PASS reload persistence')
 await page.getByRole('button',{name:'全局搜索',exact:true}).click();const commandDialog=page.getByRole('dialog',{name:'导航与命令',exact:true});await commandDialog.waitFor();await commandDialog.getByRole('button',{name:'切换深浅主题',exact:true}).click();await page.waitForFunction(()=>document.documentElement.classList.contains('dark'),null,{timeout:15000});await page.setViewportSize({width:1000,height:760});await page.screenshot({path:join(data,'workflow-dark.png')})
 if(process.env.RESEARCH_TEST_NATIVE==='1'){
   await openProject();await page.locator('[contenteditable="true"]').waitFor();
   const editor=page.locator('[contenteditable="true"]').first();await editor.fill('Reply exactly UI_STREAM_OK. Do not call any tools or edit files.');await page.getByRole('button',{name:'Send message',exact:true}).click({timeout:60000});await page.getByText('UI_STREAM_OK',{exact:true}).waitFor({timeout:90000});await page.screenshot({path:join(data,'chat-stream.png')});console.log('PASS actual native model prompt and streamed response')
   await page.getByRole('button',{name:/^重命名 /}).first().click();await page.getByRole('textbox',{name:'线程名称'}).fill('Stream verification');await page.getByRole('button',{name:'保存线程名称',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).waitFor();await page.getByRole('button',{name:'归档线程',exact:true}).click();await page.getByRole('button',{name:'显示已归档线程',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).waitFor();await page.getByRole('button',{name:'恢复线程',exact:true}).click();await page.getByRole('button',{name:'隐藏已归档线程',exact:true}).click();await page.getByRole('button',{name:'Stream verification',exact:true}).click();console.log('PASS thread rename, archive and restore');await page.locator('[contenteditable="true"]').first().fill('Reply exactly UI_RESUME_OK. Do not call tools or edit files.');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('UI_RESUME_OK',{exact:true}).waitFor({timeout:90000});console.log('PASS send resumes restored native thread')
   const sessionData=await apiRequest('/native-agents/sessions');const thread=sessionData.sessions.find(s=>s.scope.context.kind==='research-repository');assert.equal(thread.scope.workspace.id,'paper-verification');assert.equal(thread.scope.workspace.revision,'working-tree');console.log('PASS paper repository thread scope')
   await nav('工作流');await page.getByRole('checkbox',{name:'批准此固定版本，并允许各节点指定的原生 Agent 访问工作区副本。正文应用仍需单独确认。'}).check();await page.getByRole('button',{name:'批准版本 1',exact:true}).click();await page.getByRole('button',{name:'运行获批节点',exact:true}).click();
   await page.getByRole('button',{name:'处理审批',exact:true}).waitFor({timeout:60000});await page.getByRole('button',{name:'处理审批',exact:true}).click();
   await page.locator('.native-chat-host').getByText(/Native operation approval|运行命令|执行命令|operation approval/).first().waitFor({timeout:15000});
   await nav('工作流');await page.getByRole('button',{name:'请求取消',exact:true}).first().click();await page.locator('summary').filter({hasText:'获批节点执行 · 已确认取消'}).waitFor({timeout:15000});
   await page.screenshot({path:join(data,'workflow-cancelled.png')});console.log('PASS actual workflow launch, approval navigation and cancellation; three-stage completion not asserted')
 }
 const bottom=page.getByRole('button',{name:'下栏',exact:true});if(await bottom.getAttribute('aria-pressed')!=='true')await bottom.click()
 await page.getByRole('button',{name:'打开终端',exact:true}).click();await page.locator('.xterm-helper-textarea').waitFor();await page.locator('.xterm-helper-textarea').fill("printf '\\nTERMINAL_%s\\n' VERIFIED; pwd");await page.locator('.xterm-helper-textarea').press('Enter');
 try {
   await page.locator('.xterm-screen').getByText('TERMINAL_VERIFIED',{exact:true}).waitFor({timeout:90000});console.log('PASS real browser PTY shell')
 } catch(error) {
   const sessions=await fetch(base+'/api/v1/terminals?workspaceId=paper-verification').then(r=>r.text()).catch(e=>String(e));
   const screen=await page.locator('.xterm-screen').innerText().catch(()=>'<no xterm-screen>');
   console.log('PTY diagnostics: sessions=',sessions,'screen=',JSON.stringify(screen.slice(-400)),'backend=',backendErrors.slice(-400));
   throw error
 }
 await page.getByRole('button',{name:'关闭终端 1',exact:true}).click();await nav('设置');await page.locator('[data-xgc-role="native-provider-settings"]').waitFor();assert.equal(await page.getByText('OpenCode',{exact:true}).count(),1);console.log('PASS shared native provider settings')
 assert.deepEqual(errors,[]);console.log('PASS no browser runtime exceptions');console.log('Artifacts:',data)
} catch(error) {
 if(page){await page.screenshot({path:join(data,'failure.png')}).catch(()=>{});console.log('Failure screen:',(await page.locator('body').innerText()).slice(-3500))}
 console.log('Failure artifacts:',data);throw error
} finally {
 if(browser)await browser.close();if(server)await server.close();api.kill('SIGTERM')
}
