// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  decodeMultiCameraMonitorStreams,
  encodeMultiCameraMonitorStreams,
  MULTI_CAMERA_MONITOR_DEFAULTS,
  multiCameraMonitorOptions,
  nextMultiCameraMonitorStreamID,
  validateMultiCameraMonitorOptions,
  validateMultiCameraMonitorOptionsIssue,
} from './multiCameraMonitorModel';

describe('multiCameraMonitorModel', () => {
  it('decodes ordered direct Edge sources and playback policy', () => {
    const streams = [
      { id:'hangar',name:'Hangar',edgeUrl:'http://192.0.2.10:18090',sourceId:'front',enabled:true },
      { id:'uav-1',name:'UAV 1',edgeUrl:'https://video.example:18443',sourceId:'camera.main',enabled:false },
    ];
    expect(multiCameraMonitorOptions({
      streamsJson:encodeMultiCameraMonitorStreams(streams),
      layoutColumns:'2',tileAspectRatio:'4:3',imageFit:'cover',
      reconnectPolicy:'manual',showMetadata:false,
    })).toEqual({
      streams,layoutColumns:'2',tileAspectRatio:'4:3',imageFit:'cover',
      reconnectPolicy:'manual',showMetadata:false,
    });
  });

  it('rejects malformed, duplicate, invalid, and empty enabled source sets', () => {
    expect(decodeMultiCameraMonitorStreams('{').error).toMatch(/valid JSON/);
    expect(validateMultiCameraMonitorOptions({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:'[]',
    })).toMatch(/at least one/);
    expect(validateMultiCameraMonitorOptions({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([
        { id:'same',name:'One',edgeUrl:'http://edge-one:18090',sourceId:'front',enabled:true },
        { id:'same',name:'Two',edgeUrl:'http://edge-two:18090',sourceId:'rear',enabled:true },
      ]),
    })).toMatch(/duplicated/);
    expect(validateMultiCameraMonitorOptions({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([
        { id:'one',name:'One',edgeUrl:'http://edge-one:18090/path',sourceId:'front',enabled:true },
      ]),
    })).toMatch(/absolute HTTP/);
    expect(validateMultiCameraMonitorOptions({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([
        { id:'one',name:'One',edgeUrl:'http://edge-one:18090',sourceId:'front',enabled:false },
      ]),
    })).toMatch(/Enable at least one/);
  });

  it('generates a stable unused source ID', () => {
    expect(nextMultiCameraMonitorStreamID([
      { id:'camera-1',name:'One',edgeUrl:'',sourceId:'front',enabled:true },
      { id:'camera-3',name:'Three',edgeUrl:'',sourceId:'rear',enabled:true },
    ])).toBe('camera-2');
  });

  it('allows an incomplete disabled source to remain as a saved draft', () => {
    expect(validateMultiCameraMonitorOptions({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([
        { id:'live',name:'Live',edgeUrl:'http://edge:18090',sourceId:'front',enabled:true },
        { id:'draft',name:'Draft',edgeUrl:'',sourceId:'',enabled:false },
      ]),
    })).toBe('');
  });

  it('returns typed codes and dynamic args for every parameterized validation branch',() => {
    expect(decodeMultiCameraMonitorStreams('{').issue)
      .toEqual({ code:'camera-sources-invalid-json' });
    expect(validateMultiCameraMonitorOptionsIssue({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,streamsJson:'[]',
    })).toEqual({ code:'camera-sources-empty' });
    expect(validateMultiCameraMonitorOptionsIssue({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify(Array.from({ length:17 },(_,index) => ({
        id:`camera-${index}`,name:`Camera ${index}`,edgeUrl:'http://edge:18090',sourceId:'front',enabled:true,
      }))),
    })).toEqual({ code:'camera-sources-too-many',args:{ maximum:16 } });
    expect(validateMultiCameraMonitorOptionsIssue({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([{ id:'bad id',name:'Front',edgeUrl:'http://edge:18090',sourceId:'front',enabled:true }]),
    })).toEqual({ code:'camera-source-invalid-id',args:{ label:'Front' } });
    expect(validateMultiCameraMonitorOptionsIssue({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,
      streamsJson:JSON.stringify([{ id:'front',name:'Front',edgeUrl:'http://edge/path',sourceId:'front',enabled:true }]),
    })).toEqual({
      code:'camera-source-runtime-invalid',
      args:{ label:'Front',issue:{ code:'media-edge-url-invalid' } },
    });
    expect(validateMultiCameraMonitorOptionsIssue({
      ...MULTI_CAMERA_MONITOR_DEFAULTS,layoutColumns:'many',
      streamsJson:JSON.stringify([{
        id:'front',name:'Front',edgeUrl:'http://edge:18090',sourceId:'front',enabled:true,
      }]),
    })).toEqual({ code:'camera-option-unsupported',args:{ key:'layoutColumns' } });
  });
});
