import { request } from '../../api/http';
import { segment } from '../../shared/url';
import type { SceneSimulatorSupport } from '../experiment/experimentPublic';

/** GET /scenes/{name}: a venue asset's contents generated from its parts (D-116 V1). */
export type VenueAssetDetail = {
  name: string;
  kind: 'still' | 'loop' | 'obstacle';
  origin: 'platform' | 'user';
  note: string;
  createdAt: string;
  /** Plain-language statement of what selecting this venue does. */
  onSelect: string;
  labels: string[];
  obstacles?: {
    frame: string;
    count: number;
    shapes: Record<string, number>;
    extent?: { unit: string; minX: number; minY: number; maxX: number; maxY: number };
    boxes?: Array<{ x: number; y: number; w: number; h: number }>;
  };
  camera?: {
    name?: string;
    width: number;
    height: number;
    fx?: number;
    fy?: number;
    cx?: number;
    cy?: number;
    distortionModel?: string;
  };
  extrinsic?: {
    parentFrame: string;
    childFrame: string;
    translation: [number, number, number];
    heightMeters: number;
  };
  fieldSite: boolean;
  /** Directory-provided still preview; independent of source media and camera playback. */
  preview?: { kind: 'still'; file: string; width?: number; height?: number };
  /** Recording-window declaration (D-116 V2); topic playback is not implemented. */
  recordingWindow?: {
    recordingId: string;
    startSec: number;
    endSec: number;
    restamp: string;
    viewpoint: { camera: string; parentFrame: string };
    topics: Array<{ name: string; type: string; messages: number }>;
  };
  media?: { kind: string; width?: number; height?: number; fps?: number; durationSec?: number };
  window?: { timeSec?: number; startSec?: number; endSec?: number };
  source?: { recordingId?: string; sessionId?: string; experimentResourceId?: string };
  parts: Array<{ role: string; file: string; sha256: string; bytes: number; digestMatches?: boolean }>;
  composedFrom?: Array<{
    role: string;
    name: string;
    revisionId: string;
    sha256: string;
    /** An assembled world's element placement (D-116 V3). */
    placement?: { x: number; y: number; yaw: number };
  }>;
  gazeboWorld?: {
    file: string;
    role?: string;
    path?: string;
  };
  simulators?: Record<string, SceneSimulatorSupport>;
  replayable: boolean;
  replayIssues: string[];
  revisions: Array<{ name: string; revisionId?: string; missing?: boolean; createdAt: string; origin: string; note: string; current: boolean }>;
};

export function getVenueAssetDetail(name: string, signal?: AbortSignal): Promise<VenueAssetDetail> {
  return request<VenueAssetDetail>(`/scenes/${segment(name)}`, signal ? { signal } : {});
}

/** Same-origin preview URL for the venue's still frame or clip. */
export function venueAssetMediaUrl(name: string): string {
  return `/api/scenes/${segment(name)}/media`;
}

/** Same-origin still preview served from the scene asset directory. */
export function venueAssetPreviewUrl(name: string): string {
  return `/api/scenes/${segment(name)}/preview`;
}
