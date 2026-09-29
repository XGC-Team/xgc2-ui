import { describe,expect,it } from 'vitest';
import type { AutomationRunDetail } from '../../domains/automation/automationPublic';
import {
  publicationIdFromRunParameters,

  scientificGalleryBagCount,
  scientificGalleryBagFileName,
  scientificGalleryBagTree,
  scientificGalleryPlotFailure,
  scientificGalleryPlotStillWorking,
} from './scientificGalleryPanelModel';

describe('scientificGalleryBagTree',() => {
  it('groups archive-root bags under Data files',() => {
    const folders = scientificGalleryBagTree([
      { name:'run-42.bag' },
      { name:'run-7.bag' },
    ]);
    expect(folders).toEqual([
      {
        id:'data',
        title:'Data files',
        bags:[{ name:'run-42.bag' },{ name:'run-7.bag' }],
        folders:[],
      },
    ]);
    expect(scientificGalleryBagCount(folders[0])).toBe(2);
  });

  it('nests subdirectory bags as sibling folders of root Data files',() => {
    const folders = scientificGalleryBagTree([
      { name:'four-scout/run-1.bag' },
      { name:'four-scout/inner/run-2.bag' },
      { name:'root.bag' },
    ]);
    expect(folders).toEqual([
      {
        id:'data',
        title:'Data files',
        bags:[{ name:'root.bag' }],
        folders:[],
      },
      {
        id:'four-scout',
        title:'four-scout',
        bags:[{ name:'four-scout/run-1.bag' }],
        folders:[{
          id:'four-scout/inner',
          title:'inner',
          bags:[{ name:'four-scout/inner/run-2.bag' }],
          folders:[],
        }],
      },
    ]);
    expect(scientificGalleryBagCount(folders[0]) + scientificGalleryBagCount(folders[1])).toBe(3);
    expect(scientificGalleryBagFileName('four-scout/inner/run-2.bag')).toBe('run-2.bag');
  });

  it('orders folders by recorded startedAt, never archive createdAt',() => {
    const folders = scientificGalleryBagTree([
      { name:'ugv4/a.bag',createdAt:'2026-09-20T00:00:00Z',startedAt:'2026-01-01T00:00:00Z' },
      { name:'mixed/b.bag',createdAt:'2026-01-01T00:00:00Z',startedAt:'2026-09-19T00:00:00Z' },
    ]);
    expect(folders.map((folder) => folder.id)).toEqual(['mixed','ugv4']);
  });

  it('keeps 32-hex recording directories as folders titled from the bag file',() => {
    const folders = scientificGalleryBagTree([
      { name:'47e730d70c873df8d759202c9accf0f1/xgc_2026-09-17-14-52-21_0.bag',startedAt:'2026-09-17T14:52:21Z',createdAt:'2026-09-20T00:00:00Z' },
      { name:'68d6094c7ed54d4fe3c962f8708f0989/xgc_2026-09-17-14-55-15_0.bag',startedAt:'2026-09-17T14:55:15Z',createdAt:'2026-01-01T00:00:00Z' },
      { name:'xdata_phy_2026-01-14.bag',startedAt:'2026-01-14T21:42:33Z',createdAt:'2026-09-20T00:00:00Z' },
    ]);
    expect(folders.map((folder) => folder.id)).toEqual([
      '68d6094c7ed54d4fe3c962f8708f0989',
      '47e730d70c873df8d759202c9accf0f1',
      'data',
    ]);
    expect(folders[0]).toEqual({
      id:'68d6094c7ed54d4fe3c962f8708f0989',
      title:'xgc_2026-09-17-14-55-15_0',
      bags:[{ name:'68d6094c7ed54d4fe3c962f8708f0989/xgc_2026-09-17-14-55-15_0.bag',startedAt:'2026-09-17T14:55:15Z',createdAt:'2026-01-01T00:00:00Z' }],
      folders:[],
    });
    expect(folders[2]).toEqual({
      id:'data',
      title:'Data files',
      bags:[{ name:'xdata_phy_2026-01-14.bag',startedAt:'2026-01-14T21:42:33Z',createdAt:'2026-09-20T00:00:00Z' }],
      folders:[],
    });
  });
});

describe('scientificGalleryPlot occupancy',() => {
  it('keeps plotting occupied while a join-later child is still running',() => {
    const detail = {
      run:{ status:'succeeded' },
      invocations:[],
      nodeSummaries:[],
      relations:{
        childRuns:[{ observedStatus:'running',runStatus:'waiting' }],
      },
      loading:false,
      error:'',
    } as unknown as AutomationRunDetail;
    expect(scientificGalleryPlotStillWorking(detail)).toBe(true);
    expect(scientificGalleryPlotStillWorking({
      ...detail,
      relations:{ childRuns:[{ observedStatus:'succeeded',runStatus:'succeeded' }] },
    } as unknown as AutomationRunDetail)).toBe(false);
    expect(scientificGalleryPlotStillWorking(undefined,'running')).toBe(true);
  });

  it('uses the current child Run fact over the relation observation retained at join',() => {
    const detail = {
      run:{ status:'succeeded' },nodeSummaries:[],
      relations:{ childRuns:[{
        observedStatus:'running',observedRevision:2,runStatus:'succeeded',runRevision:4,
      }] },
    } as unknown as AutomationRunDetail;
    expect(scientificGalleryPlotStillWorking(detail)).toBe(false);
  });

  it('reads the python plot-results node error',() => {
    expect(scientificGalleryPlotFailure({
      run:{ status:'failed' },
      invocations:[],
      nodeSummaries:[{
        nodeId:'plot-results',kind:'process.run-python-script',status:'failed',
        error:'SCE1 analysis refused: missing record_*',
      }],
      loading:false,
      error:'',
    } as unknown as AutomationRunDetail)).toBe('SCE1 analysis refused: missing record_*');
  });
});

describe('figure publication identity',() => {
  it('accepts issued bag identities as figure publications',() => {
    const bagId = 'bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0';
    expect(publicationIdFromRunParameters({ publicationId: bagId })).toBe(bagId);
    expect(publicationIdFromRunParameters({
      inputOverridesJson: JSON.stringify({ publicationId: bagId }),
    })).toBe(bagId);
    expect(publicationIdFromRunParameters({ publicationId: 'bag-1' })).toBe('');
  });
});
