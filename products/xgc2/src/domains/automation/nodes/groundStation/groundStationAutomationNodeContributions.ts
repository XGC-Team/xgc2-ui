import {
  BellRing,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  ClipboardClock,
  ClipboardPenLine,
  ExternalLink,
  MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeGraphSemantics,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';

type GroundStationContributionOptions = {
  kind: string;
  typeVersion: number;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords?: readonly string[];
  graphSemantics?: AutomationNodeGraphSemantics;
};

function groundStationContribution({
  kind,typeVersion,label,description,icon,keywords = [],graphSemantics,
}: GroundStationContributionOptions): AutomationNodeWebContribution {
  return Object.freeze({
    identity: defineAutomationNodeContributionIdentity(
      `automation.nodes.ground-station.${kind}@${typeVersion}`,
    ),
    kind,
    typeVersion,
    library: Object.freeze({
      label,
      description,
      category: 'ground-station',
      categoryDescription: 'Publish and wait on ground-station operator interactions',
      keywords: Object.freeze([...keywords]),
    }),
    visual: Object.freeze({ icon }),
    ...(graphSemantics ? { graphSemantics: Object.freeze(graphSemantics) } : {}),
  });
}

const waitConfirmationRoutes: AutomationNodeGraphSemantics = {
  calledSuccessRoutes: () => ['confirmed', 'canceled', 'timed-out'],
};

const waitFormRoutes: AutomationNodeGraphSemantics = {
  calledSuccessRoutes: () => ['submitted', 'canceled', 'timed-out'],
};

/**
 * Static Automation.Nodes.GroundStation web leaf. Exact kind@version set for
 * operator interaction authoring chrome.
 */
export const groundStationAutomationNodeContributions = Object.freeze([
  groundStationContribution({
    kind: 'gcs.request-confirmation',
    typeVersion: 1,
    label: 'Request confirmation',
    description: 'Publish a durable confirmation request into the ground-station panel.',
    icon: CircleHelp,
    keywords: ['confirmation', 'approve', 'reject', 'decision', 'ground station', '确认', '审批'],
  }),
  groundStationContribution({
    kind: 'human.wait-confirmation',
    typeVersion: 1,
    label: 'Wait for confirmation',
    description: 'Wait for a panel confirmation and route confirmed, canceled, or timed-out.',
    icon: MessageCircleQuestion,
    keywords: ['wait', 'confirmation', 'confirmed', 'canceled', 'timeout', '等待', '确认'],
    graphSemantics: waitConfirmationRoutes,
  }),
  groundStationContribution({
    kind: 'gcs.request-form',
    typeVersion: 1,
    label: 'Request operator form',
    description: 'Publish a durable operator form request into the ground-station panel.',
    icon: ClipboardPenLine,
    keywords: ['form', 'operator', 'input', 'ground station', '表单', '操作员'],
  }),
  groundStationContribution({
    kind: 'human.wait-form',
    typeVersion: 1,
    label: 'Wait for operator form',
    description: 'Wait for an operator form and route submitted, canceled, or timed-out.',
    icon: ClipboardClock,
    keywords: ['wait', 'form', 'submitted', 'canceled', 'timeout', '等待', '表单'],
    graphSemantics: waitFormRoutes,
  }),
  groundStationContribution({
    kind: 'notification',
    typeVersion: 2,
    label: 'Notification',
    description: 'Publish a notification to the ground station notification center.',
    icon: BellRing,
    keywords: ['notification', 'toast', 'message', '通知', '消息'],
  }),
  groundStationContribution({
    kind: 'gcs.status-card',
    typeVersion: 1,
    label: 'Workflow status card',
    description: 'Publish or update a persistent workflow status card.',
    icon: ChartNoAxesColumnIncreasing,
    keywords: ['status', 'card', 'progress', 'workflow', '状态', '卡片'],
  }),
  groundStationContribution({
    kind: 'gcs.offer-context',
    typeVersion: 1,
    label: 'Offer ground-station context',
    description: 'Offer a safe link to relevant ground-station context.',
    icon: ExternalLink,
    keywords: ['context', 'link', 'navigation', 'ground station', '上下文', '跳转'],
  }),
] satisfies readonly AutomationNodeWebContribution[]);
