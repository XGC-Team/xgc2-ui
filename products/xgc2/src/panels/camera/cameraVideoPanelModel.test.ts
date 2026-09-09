// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  cameraVideoPanelOptions,
  cameraVideoPanelRuntime,
  containedVideoSize,
  validateCameraVideoPanelOptions,
  validateCameraVideoPanelOptionsIssue,
} from './cameraVideoPanelModel';

describe('containedVideoSize', () => {
  it('letterboxes a 16:9 frame inside a wide, low panel without cropping', () => {
    expect(containedVideoSize({
      containerWidth:424,
      containerHeight:156,
      sourceWidth:3840,
      sourceHeight:2160,
    })).toEqual({
      width:277.3333333333333,
      height:156,
    });
  });

  it('letterboxes the unused vertical axis when the panel is taller than the source', () => {
    expect(containedVideoSize({
      containerWidth:309,
      containerHeight:220,
      sourceWidth:3840,
      sourceHeight:2160,
    })).toEqual({
      width:309,
      height:173.8125,
    });
  });
});

describe('cameraVideoPanelRuntime', () => {
  it('waits for a configured Media Edge URL', () => {
    expect(cameraVideoPanelRuntime({
      requestedEdgeUrl: '',
      requestedSourceId: 'usb_cam',
    })).toEqual({
      kind: 'waiting',
      title: 'Configure Media Edge',
      description: 'Set the camera Media Edge URL in the panel settings.',
      issue:{ code:'media-edge-required' },
    });
  });

  it('normalizes an absolute origin and returns the configured source', () => {
    expect(cameraVideoPanelRuntime({
      requestedEdgeUrl: 'HTTPS://EDGE.EXAMPLE:18443/',
      requestedSourceId: 'front.camera-1',
    })).toEqual({
      kind: 'ready',
      title: 'front.camera-1',
      description: '',
      edgeUrl: 'https://edge.example:18443',
      sourceId: 'front.camera-1',
    });
  });

  it('rejects a URL with anything beyond an HTTP origin', () => {
    expect(cameraVideoPanelRuntime({
      requestedEdgeUrl: 'http://edge.example:18090/api',
      requestedSourceId: 'front',
    })).toMatchObject({
      kind: 'failed',
      title: 'Invalid Media Edge URL',
    });
  });

  it('waits for a source and rejects an unstable source ID', () => {
    expect(cameraVideoPanelRuntime({
      requestedEdgeUrl: 'http://edge.example:18090',
      requestedSourceId: '',
    })).toMatchObject({
      kind: 'waiting',
      title: 'Configure camera source',
    });
    expect(cameraVideoPanelRuntime({
      requestedEdgeUrl: 'http://edge.example:18090',
      requestedSourceId: '../front',
    })).toMatchObject({
      kind: 'failed',
      title: 'Invalid camera source',
    });
  });
});

describe('validateCameraVideoPanelOptions', () => {
  it('defaults the media workflow binding and validates configured binding IDs', () => {
    expect(cameraVideoPanelOptions({}).mediaBindingId).toBe('b2-onboard-media');
    expect(cameraVideoPanelOptions({ mediaBindingId:'b2-camera-topic-media' }).mediaBindingId)
      .toBe('b2-camera-topic-media');
    expect(validateCameraVideoPanelOptions({
      mediaBindingId:'b2-camera-topic-media',
    })).toBe('');
    expect(validateCameraVideoPanelOptions({
      mediaBindingId:' ../unsafe',
    })).toMatch(/stable binding ID/);
    expect(validateCameraVideoPanelOptionsIssue({ mediaBindingId:' ../unsafe' }))
      .toEqual({ code:'media-binding-id-invalid' });
    expect(validateCameraVideoPanelOptionsIssue({ autoConnect:'yes' }))
      .toEqual({ code:'camera-boolean-option-invalid',args:{ field:'autoConnect' } });
  });
});
