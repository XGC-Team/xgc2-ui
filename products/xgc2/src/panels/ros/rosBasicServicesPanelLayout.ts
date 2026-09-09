import type { CSSProperties } from 'react';
import { controlActionGridStyle } from '../../shared/controlActionGrid';
import { rosBasicServices,type RosBasicServiceId } from './rosBasicServicesPanelModel';

/**
 * Layout-only option keys. The process-parameter closure (world, RViz config, master URI)
 * lands in the same manifest optionSchema, so every key here carries the `layout` prefix
 * and none of them names a ROS concept.
 */
export const ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS = {
  buttonsPerRow: 'layoutButtonsPerRow',
  order: 'layoutServiceOrder',
  hidden: 'layoutHiddenServices',
} as const;

export const ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW = 1;
/** More columns than services would only reserve dead width. */
export const ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW = rosBasicServices.length;
export const ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW = 4;

export type RosBasicServicesLayout = {
  buttonsPerRow: number;
  /** Every service in authored order, hidden ones included, so hide/show keeps a tile's position. */
  order: RosBasicServiceId[];
  hidden: RosBasicServiceId[];
  shown: RosBasicServiceId[];
};

const rosBasicServiceIds = rosBasicServices.map((service) => service.id);

/** Fresh arrays per call: manifest defaults are spread into saved documents. */
export function rosBasicServicesLayoutDefaultOptions(): Record<string,unknown> {
  return rosBasicServicesLayoutPanelOptions(rosBasicServicesLayoutOptions({}));
}

function isRosBasicServiceId(value: unknown): value is RosBasicServiceId {
  return typeof value === 'string' && (rosBasicServiceIds as readonly string[]).includes(value);
}

/**
 * Resolve the authored layout, repairing anything a hand-edited or older document can hold:
 * a partial order (services provisioned after the panel was saved), duplicates, unknown ids,
 * or an every-service hide that would render an unusable empty grid.
 */
export function rosBasicServicesLayoutOptions(options: Record<string,unknown>): RosBasicServicesLayout {
  const order = normalizeServiceIds(options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.order]);
  for (const id of rosBasicServiceIds) if (!order.includes(id)) order.push(id);
  const hiddenAuthored = new Set(normalizeServiceIds(options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.hidden]));
  const hidden = hiddenAuthored.size >= order.length ? new Set<RosBasicServiceId>() : hiddenAuthored;
  return {
    buttonsPerRow: rosBasicServicesButtonsPerRow(options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.buttonsPerRow]),
    order,
    hidden: order.filter((id) => hidden.has(id)),
    shown: order.filter((id) => !hidden.has(id)),
  };
}

export function rosBasicServicesButtonsPerRow(value: unknown): number {
  const requested = typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW;
  return Math.min(
    ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW,
    Math.max(ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW, requested),
  );
}

/** Serialize the resolved layout back into panel options so an edit persists the repair. */
export function rosBasicServicesLayoutPanelOptions(layout: RosBasicServicesLayout): Record<string,unknown> {
  return {
    [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.buttonsPerRow]: layout.buttonsPerRow,
    [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.order]: [...layout.order],
    [ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.hidden]: [...layout.hidden],
  };
}

export function validateRosBasicServicesLayoutOptions(options: Record<string,unknown>): string {
  const perRow = options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.buttonsPerRow];
  if (perRow !== undefined && (
    typeof perRow !== 'number'
    || !Number.isInteger(perRow)
    || perRow < ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW
    || perRow > ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW
  )) {
    return `Buttons per row must be a whole number between ${ROS_BASIC_SERVICES_MIN_BUTTONS_PER_ROW} and ${ROS_BASIC_SERVICES_MAX_BUTTONS_PER_ROW}.`;
  }
  const orderError = validateServiceIdList(options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.order], 'Service order');
  if (orderError) return orderError;
  const hiddenError = validateServiceIdList(options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.hidden], 'Hidden services');
  if (hiddenError) return hiddenError;
  const hidden = options[ROS_BASIC_SERVICES_LAYOUT_OPTION_KEYS.hidden];
  if (Array.isArray(hidden) && new Set(hidden).size >= rosBasicServiceIds.length) {
    return 'At least one service button must stay visible.';
  }
  return '';
}

/**
 * Geometry for the shared `.xgc-control-action-grid` (see controlActionGridStyle).
 * Density + place columns stay in one owner so ROS no longer ships a parallel var set.
 */
export function rosBasicServicesControlGridStyle(shownCount: number, buttonsPerRow: number): CSSProperties {
  return controlActionGridStyle({ itemCount: shownCount, maxColumns: buttonsPerRow });
}

export function moveRosBasicServiceInOrder(
  order: readonly RosBasicServiceId[],
  id: RosBasicServiceId,
  offset: number,
): RosBasicServiceId[] {
  const from = order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const moved = [...order];
  moved.splice(to, 0, ...moved.splice(from, 1));
  return moved;
}

function normalizeServiceIds(value: unknown): RosBasicServiceId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<RosBasicServiceId>();
  for (const entry of value) if (isRosBasicServiceId(entry)) seen.add(entry);
  return [...seen];
}

function validateServiceIdList(value: unknown, label: string): string {
  if (value === undefined) return '';
  if (!Array.isArray(value)) return `${label} must be a list of service ids.`;
  const seen = new Set<unknown>();
  for (const entry of value) {
    if (!isRosBasicServiceId(entry)) return `${label} contains an unknown service id.`;
    if (seen.has(entry)) return `${label} lists ${entry} more than once.`;
    seen.add(entry);
  }
  return '';
}
