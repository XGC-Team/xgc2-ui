import assert from 'node:assert/strict'
import {emptyStream} from '@xgc2/native-agent/state'
import {nativeConversationModel} from '../node_modules/@xgc2/native-agent/dist/nativePresentation.js'
import {mergeTimelineItems} from '../node_modules/@xgc2/native-agent/dist/NativeConversation.js'
const state=emptyStream('presentation-check','codex');state.worker='ready';state.activeTurnId='turn'
const at=n=>`2026-09-08T08:40:0${n}Z`
state.items=[
 {key:'read',id:'read',turnId:'turn',role:'tool',text:'',title:'Read source',status:'completed',createdAt:at(1)},
 {key:'diff',id:'turn-diff',turnId:'turn',role:'tool',text:'diff --git a/main.tex b/main.tex',title:'Proposed diff',status:'running',sourceMethod:'turn/diff/updated',turnStatus:'completed',createdAt:at(3)},
 {key:'unknown',id:'unknown',turnId:'turn',role:'tool',text:'',title:'Unconfirmed command',status:'running',turnStatus:'completed',createdAt:at(5)}
]
const model=nativeConversationModel(state,'zh')
assert.equal(model.items[0].createdAt,at(1))
assert.equal(model.items[1].status,undefined)
assert.equal(model.items[1].tone,'info')
assert.equal(model.items[1].detail,state.items[1].text)
assert.equal(model.items[2].status,'完成结果未确认')
const merged=mergeTimelineItems(model.items,[{kind:'custom',id:'approval',createdAt:at(2),content:null}])
assert.equal(merged[1].id,'approval')
console.log('PASS decision chronology, diff preview semantics, real unconfirmed execution retained')
