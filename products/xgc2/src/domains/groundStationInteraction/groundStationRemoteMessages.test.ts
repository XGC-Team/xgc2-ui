// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest';

describe('ground station remote message lifecycle',() => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  it('keeps a closed message immutable across reload while permitting a separate new controller',async () => {
    let store = await import('./groundStationRemoteMessages');
    const original = {id:'old',robots:[{name:'scout-01'}]};
    store.syncGroundStationRemoteMessages('experiment','panel',[original]);
    store.syncGroundStationRemoteMessages('experiment','panel',[]);
    expect(store.isGroundStationRemoteMessageClosed('experiment','old')).toBe(true);
    vi.resetModules();
    store = await import('./groundStationRemoteMessages');
    expect(store.isGroundStationRemoteMessageClosed('experiment','old')).toBe(true);
    store.syncGroundStationRemoteMessages('experiment','panel',[original,{...original,id:'new'}]);
    expect(store.isGroundStationRemoteMessageClosed('experiment','old')).toBe(true);
    expect(store.isGroundStationRemoteMessageClosed('experiment','new')).toBe(false);
    const records = JSON.parse(localStorage.getItem('xgc.experiment.experiment.remote-messages.v1') ?? '[]');
    expect(records).toHaveLength(2);
    expect(records[0].closedAt).toEqual(expect.any(String));
  });
  it('does not close another panel’s message',async () => {
    const store = await import('./groundStationRemoteMessages');
    store.syncGroundStationRemoteMessages('experiment','other',[{id:'other',robots:[{name:'scout-02'}]}]);
    store.syncGroundStationRemoteMessages('experiment','panel',[]);
    expect(store.isGroundStationRemoteMessageClosed('experiment','other')).toBe(false);
  });
  it('keeps an Agent controller in its original conversation when another conversation receives it',async () => {
    const store=await import('./groundStationRemoteMessages');
    store.syncGroundStationRemoteMessages('experiment','panel',[
      {id:'global-controller',conversationId:'original',robots:[{name:'scout-01'}]},
    ],'currently-visible');
    const records=JSON.parse(localStorage.getItem('xgc.experiment.experiment.remote-messages.v1')!);
    expect(store.remoteMessagesForConversation(records,'currently-visible')).toEqual([]);
    expect(store.remoteMessagesForConversation(records,'original').map(item=>item.id)).toEqual(['global-controller']);
  });
  it('isolates conversations without reassigning old controllers when selection changes',async () => {
    const store = await import('./groundStationRemoteMessages');
    const old = {id:'old',robots:[{name:'scout-01'}]};
    store.syncGroundStationRemoteMessages('experiment','panel',[old],'session-a');
    store.syncGroundStationRemoteMessages('experiment','panel',[old],'session-b');
    store.syncGroundStationRemoteMessages('experiment','panel',[],'session-b');
    store.syncGroundStationRemoteMessages('experiment','panel',[{...old,id:'new'}],'session-b');
    const records = JSON.parse(localStorage.getItem('xgc.experiment.experiment.remote-messages.v1') ?? '[]');
    expect(store.remoteMessagesForConversation(records,'session-a').map(item => item.id)).toEqual(['old']);
    expect(store.remoteMessagesForConversation(records,'session-b').map(item => item.id)).toEqual(['new']);
    expect(store.remoteMessagesForConversation(records,'session-c')).toEqual([]);
    expect(store.remoteMessagesForConversation(records)).toEqual([]);
    expect(store.remoteMessagesForConversation([{...records[0],conversationId:undefined}],'session-b')).toEqual([]);
  });

  it('keeps blank-conversation messages across reload, binds only their draft, and isolates another new conversation',async () => {
    let store = await import('./groundStationRemoteMessages');
    const draft = store.remoteConversationScope('draft-experiment',null)!;
    store.syncGroundStationRemoteMessages('draft-experiment','panel',[{id:'first',robots:[{name:'scout-01'}]}],draft);
    vi.resetModules();
    store = await import('./groundStationRemoteMessages');
    expect(store.remoteConversationScope('draft-experiment',null)).toBe(draft);
    store.startRemoteConversationDraft('draft-experiment');
    const next = store.remoteConversationScope('draft-experiment',null)!;
    expect(next).not.toBe(draft);
    store.syncGroundStationRemoteMessages('draft-experiment','panel',[{id:'second',robots:[{name:'scout-02'}]}],next);
    store.bindRemoteConversationDraft('draft-experiment',draft,'session-a');
    const records = JSON.parse(localStorage.getItem('xgc.experiment.draft-experiment.remote-messages.v1')!);
    expect(store.remoteMessagesForConversation(records,'session-a').map(item => item.id)).toEqual(['first']);
    expect(store.remoteMessagesForConversation(records,next).map(item => item.id)).toEqual(['second']);
    expect(store.remoteMessagesForConversation(records,draft)).toEqual([]);
  });

  it('lists robots as wrapping chat copy rather than a pad title',async () => {
    const store = await import('./groundStationRemoteMessages');
    const names = ['px4-01','px4-02','px4-03','px4-04','px4-05','mecanum-01','mecanum-02'];
    expect(store.remoteControllerChatCopy(names,false,'en'))
      .toBe('Remote controller for px4-01, px4-02, px4-03, px4-04, px4-05, mecanum-01, mecanum-02');
    expect(store.remoteControllerChatCopy(names,true,'en'))
      .toBe('Remote controller for px4-01, px4-02, px4-03, px4-04, px4-05, mecanum-01, mecanum-02 closed');
    expect(store.remoteControllerChatCopy(names,false,'zh-CN'))
      .toBe('px4-01、px4-02、px4-03、px4-04、px4-05、mecanum-01、mecanum-02 的遥控器');
    expect(store.remoteControllerChatCopy(names,true,'zh-CN'))
      .toBe('px4-01、px4-02、px4-03、px4-04、px4-05、mecanum-01、mecanum-02 的遥控器关闭');
  });

});
