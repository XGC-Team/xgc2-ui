import { describe,expect,it } from 'vitest';
import type { ExperimentDocument } from './experimentModel';
import { resolveLegacyDevFixtureDeepLink } from './experimentLegacyDeepLink';

const legacySix = '11e9d34e-a4b7-442c-8743-f62b26df3f24';

describe('legacy local-swarm Experiment deep links',() => {
  it('resolves one live ordinary dev fixture with the requested dashboard',() => {
    expect(resolveLegacyDevFixtureDeepLink(legacySix,'gcs',[
      document('current-six','TASE-5UAVs'),
    ])).toBe('current-six');
  });

  it('fails closed for unknown, duplicate, protected, or dashboard-incompatible targets',() => {
    const current = document('current-six','TASE-5UAVs');
    expect(resolveLegacyDevFixtureDeepLink('unknown','gcs',[current])).toBe('');
    expect(resolveLegacyDevFixtureDeepLink(legacySix,'missing',[current])).toBe('');
    expect(resolveLegacyDevFixtureDeepLink(legacySix,'gcs',[current,{ ...current,head:{ ...current.head,resourceId:'duplicate' } }])).toBe('');
    expect(resolveLegacyDevFixtureDeepLink(legacySix,'gcs',[{ ...current,head:{ ...current.head,system:true } }])).toBe('');
  });

  it('never aliases over an existing resource identity',() => {
    expect(resolveLegacyDevFixtureDeepLink(legacySix,'gcs',[
      document(legacySix,'Unrelated current resource'),
      document('current-six','TASE-5UAVs'),
    ])).toBe('');
  });
});

function document(resourceId:string,name:string):ExperimentDocument {
  return {
    head:{ domain:'experiment',resourceId,name,tags:['devfixture'],mainCommitId:'commit',currentVersion:1,digest:'d',revision:1,createdAt:'',updatedAt:'' },
    branch:{ domain:'experiment',resourceId,name:'main',headCommitId:'commit',headVersion:1,revision:1,createdAt:'',updatedAt:'' },
    spec:{
      worldBoundary:null,
      schemaVersion:16,name,description:'',tags:['devfixture'],runModes:['simulation'],localizationOffset:{ x:0,y:0,z:0 },robots:[],workflowInstances:[],
      dashboards:[{ id:'gcs',name:'GCS',description:'',panels:[] }],
    },
  };
}
