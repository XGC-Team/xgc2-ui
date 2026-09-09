import { MousePointerClick } from 'lucide-react';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';

/**
 * Static Automation.Nodes.ManualTriggers web leaf. Generated product roots
 * either compose trigger.manual@2 or never import this module.
 */
export const manualTriggersAutomationNodeContributions = Object.freeze([
  Object.freeze({
    identity: defineAutomationNodeContributionIdentity(
      'automation.nodes.manual-triggers.trigger.manual@2',
    ),
    kind: 'trigger.manual',
    typeVersion: 2,
    library: Object.freeze({
      label: 'Manual trigger',
      description: 'Start this Automation on demand.',
      category: 'trigger',
      categoryDescription: 'Start Automations from an operator action',
      keywords: Object.freeze([
        'manual', 'run now', 'on demand', 'entrypoint', 'start',
        '手动', '立即运行', '入口',
      ]),
    }),
    visual: Object.freeze({ icon: MousePointerClick }),
  }),
] satisfies readonly AutomationNodeWebContribution[]);
