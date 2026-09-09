// Local UI-only patch on the retained shared artifact; never edit the live shared owner.
import {mkdtempSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
const root=resolve(import.meta.dirname,'..'),dir=mkdtempSync(join(tmpdir(),'research-native-locale-'))
execFileSync('tar',['-xzf',join(root,'vendor/xgc2-native-agent-0.1.0.tgz'),'-C',dir])
const labels={'Ask anything...':'输入消息…','Your answer':'你的回答','Cancel request':'取消请求','Previous':'上一项','Submit answer':'提交回答','Next question':'下一个问题','Approval request':'授权请求','Send message':'发送消息','Stop generating':'停止生成','Message the agent':'输入消息','Copy message':'复制消息','Copy':'复制','Copied':'已复制','Show full message':'展开消息','Show less':'收起消息','Activity':'执行记录'}
function patch(path){let text=readFileSync(path,'utf8'),changed=false;for(const [en,zh]of Object.entries(labels)){for(const q of ['"',"'"]){const exact=q+en+q;if(text.includes(exact)){text=text.split(exact).join(`(__researchChinese() ? ${JSON.stringify(zh)} : ${JSON.stringify(en)})`);changed=true}}}if(changed){text+='\nfunction __researchChinese(){return typeof document!=="undefined"&&document.documentElement.lang==="zh"}\n';writeFileSync(path,text)}}
patch(join(dir,'package/dist/T3Conversation.js'))
for(const name of ['ComposerPromptEditor.js','ComposerPrimaryActions.js','MessagesTimeline.js'])patch(join(dir,'package/dist/upstream/t3',name))
// Preserve native journal timestamps on work/plan items so decision history
// can be inserted beside its operation, rather than accumulating after tools.
const presentation=join(dir,'package/dist/nativePresentation.js')
let source=readFileSync(presentation,'utf8')
function replaceOnce(before,after){if(!source.includes(before))throw Error('Shared presentation contract changed: '+before);source=source.replace(before,after)}
// A turn diff is a preview artifact, not an executing tool awaiting completion.
replaceOnce('const data = toolData(item);', `if (item.sourceMethod === 'turn/diff/updated') return {kind:'work',id,createdAt:item.createdAt,title:locale==='zh'?'变更差异':'Proposed diff',detail:item.text,tone:'info',displayTruncated:item.truncated};
    const data = toolData(item);`)
replaceOnce("{ kind: 'work', id, title: item.title ||", "{ kind: 'work', id, createdAt: item.createdAt, title: localLabel(item.title, locale) ||")
replaceOnce("{ kind: 'plan', id, title:", "{ kind: 'plan', id, createdAt: item.createdAt, title:")
replaceOnce('detail: item.text, status, tone:', 'detail: item.text, status: localLabel(status, locale), tone:')
replaceOnce('label: option.label, warning:', 'label: localLabel(option.label, locale), warning:')
replaceOnce("request.title || copy[locale].request,", "localLabel(request.title, locale) || copy[locale].request,")
source += `
function localLabel(value,locale){if(locale!=='zh')return value;return ({'File changes':'文件修改','Proposed diff':'变更差异','Native operation approval':'操作授权','completed':'已完成','inProgress':'执行中','running':'执行中','failed':'失败','Allow this operation':'允许本次操作','Decline':'拒绝'})[value]||value}
`
writeFileSync(presentation,source)
execFileSync('tar',['-czf',join(root,'vendor/xgc2-native-agent-0.1.0-locale.tgz'),'-C',dir,'package'])
