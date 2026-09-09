import { CornerUpLeft,GitPullRequestArrow,ListRestart,Workflow,type LucideIcon } from 'lucide-react';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeGraphSemantics,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';

type CallGraphContributionOptions = {
  kind: string;
  typeVersion: number;
  label: string;
  description: string;
  category: string;
  icon: LucideIcon;
  keywords?: readonly string[];
  graphSemantics?: AutomationNodeGraphSemantics;
};

function callGraphContribution({
  kind,typeVersion,label,description,category,icon,keywords = [],graphSemantics,
}: CallGraphContributionOptions): AutomationNodeWebContribution {
  return Object.freeze({
    identity: defineAutomationNodeContributionIdentity(
      `automation.nodes.call-graph.${kind}@${typeVersion}`,
    ),
    kind,
    typeVersion,
    library: Object.freeze({
      label,
      description,
      category,
      categoryDescription: category === 'trigger'
        ? 'Start Automations when another workflow calls them'
        : 'Call child Automations and return results',
      keywords: Object.freeze([...keywords]),
    }),
    visual: Object.freeze({ icon }),
    ...(graphSemantics ? { graphSemantics: Object.freeze(graphSemantics) } : {}),
  });
}

const returnTerminal: AutomationNodeGraphSemantics = {
  terminalLabel: 'Return',
};

/**
 * Static Automation.Nodes.CallGraph web leaf. Exact four-kind protocol pack:
 * trigger.automation-call@1, automation.call@4, automation.call-each@1,
 * automation.return@1. Call-input parameter editor host wiring remains on the
 * generic shell until the editor adapter exposes document-scoped context.
 */
export const callGraphAutomationNodeContributions = Object.freeze([
  callGraphContribution({
    kind: 'trigger.automation-call',
    typeVersion: 1,
    label: 'When called by Automation',
    description: 'Start when another Automation calls this workflow.',
    category: 'trigger',
    icon: GitPullRequestArrow,
    keywords: ['called', 'call graph', 'entrypoint', 'child', 'when called', '被调用'],
  }),
  callGraphContribution({
    kind: 'automation.call',
    typeVersion: 4,
    label: 'Call Automation',
    description: 'Call another Automation and optionally wait for its result.',
    category: 'control',
    icon: Workflow,
    keywords: ['call', 'child', 'subflow', 'sync', 'async', '调用', '子流程'],
  }),
  callGraphContribution({
    kind: 'automation.call-each',
    typeVersion: 1,
    label: 'Call Automation for each',
    description: 'Call one Automation for each input item with bounded concurrency.',
    category: 'control',
    icon: ListRestart,
    keywords: ['call each', 'fan out', 'batch', 'map', 'concurrency', '批量调用'],
  }),
  callGraphContribution({
    kind: 'automation.return',
    typeVersion: 1,
    label: 'Return',
    description: 'Finish a called Automation and return its result to the caller.',
    category: 'control',
    icon: CornerUpLeft,
    keywords: ['return', 'result', 'finish', 'call graph', '返回'],
    graphSemantics: returnTerminal,
  }),
] satisfies readonly AutomationNodeWebContribution[]);
