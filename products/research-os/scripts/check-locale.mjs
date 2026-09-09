// Read-only browser check: UI language, composer labels, persistence and duplicate search.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:1440,height:960}});let errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto(process.env.RESEARCH_UI_URL||'http://localhost:5173');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('combobox',{name:'界面语言',exact:true}).selectOption('en');await page.getByRole('combobox',{name:'Interface language',exact:true}).waitFor();
await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Chat',exact:true}).click();
await page.getByRole('textbox',{name:'Message the agent',exact:true}).waitFor();await page.getByText('Ask anything...',{exact:true}).waitFor();
assert.equal(await page.locator('header input').count(),0);
await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Interface language',exact:true}).inputValue(),'en');
await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('zh');await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'聊天',exact:true}).click();
await page.getByRole('textbox',{name:'输入消息',exact:true}).waitFor();await page.getByText('输入消息…',{exact:true}).waitFor();
assert.deepEqual(errors,[]);console.log('PASS locale switching, persistence, no header search or browser errors');
}finally{await browser.close()}
