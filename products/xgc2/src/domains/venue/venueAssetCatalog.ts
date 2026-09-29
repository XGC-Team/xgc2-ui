export type VenueAssetOrigin = 'platform' | 'user';
export type VenueAssetKind = 'still' | 'loop' | 'obstacle';

/** Catalog row. Carries no storage path: a path is never a description. */
export type VenueAssetRow = {
  name: string;
  kind: VenueAssetKind;
  /** Carries only the preview capability to the list; attachment paths stay private. */
  hasPreview?: boolean;
  origin: VenueAssetOrigin;
  createdAt: string;
  note?: string;
};

export const VENUE_ORIGIN_ALL = 'all';
export const VENUE_ORIGIN_PLATFORM = 'platform';
export const VENUE_ORIGIN_USER = 'user';

export function venueAssetOrigin(origin: string | undefined): VenueAssetOrigin {
  return origin === 'platform' ? 'platform' : 'user';
}

export function venueAssetKind(kind: string | undefined): VenueAssetKind {
  if (kind === 'still' || kind === 'loop') return kind;
  return 'obstacle';
}

/** Describe the source, not an unverified promise about running an experiment. */
export function venueAssetSummary(kind: VenueAssetKind): string {
  if (kind === 'still') return 'Site photo';
  if (kind === 'loop') return 'Video source';
  return 'Obstacle layout or simulator world';
}

export function venueAssetFrozen(kind: VenueAssetKind): string {
  if (kind === 'obstacle') return 'Obstacles stay where this scene saved them.';
  return 'Obstacles stay where this scene saved them, and the experiment does not edit them again.';
}
