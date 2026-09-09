import {
  GitMerge,
  Hourglass,
  ListFilter,
  Route,
  ShieldX,
  Sigma,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { createElement,forwardRef } from 'react';
import type { AutomationNode } from '../../automationDefinitionContracts';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeEditorAdapter,
  type AutomationNodeGraphSemantics,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';
import { AutomationConditionParameters } from './AutomationConditionParameters';

const AutomationIfIcon = forwardRef<SVGSVGElement,LucideProps>(function AutomationIfIcon({ size = 24,...props }, ref) {
  return createElement('svg', { ref,width: size,height: size,viewBox: '0 0 24 24',fill: 'none',...props },
    createElement('path', { d: 'M21.5 5.75H2',stroke: 'currentColor',strokeWidth: '1.5' }),
    createElement('path', { d: 'M21.5 18.25H14.4399C13.1353 18.25 11.9802 17.4069 11.5826 16.1643L8.91742 7.83568C8.5198 6.59314 7.36475 5.75 6.06014 5.75H2',stroke: 'currentColor',strokeWidth: '1.5' }),
    createElement('path', { d: 'M18.5 2.75L21.5 5.75L18.5 8.75',stroke: 'currentColor',strokeWidth: '1.5' }),
    createElement('path', { d: 'M18.5 15.25L21.5 18.25L18.5 21.25',stroke: 'currentColor',strokeWidth: '1.5' }),
  );
});

type CoreFlowContributionOptions = {
  kind: string;
  typeVersion: number;
  label: string;
  description: string;
  category: 'control' | 'data';
  icon: LucideIcon;
  editor?: AutomationNodeEditorAdapter;
  graphSemantics?: AutomationNodeGraphSemantics;
};

function coreFlowContribution({
  kind,typeVersion,label,description,category,icon,editor,graphSemantics,
}: CoreFlowContributionOptions): AutomationNodeWebContribution {
  return Object.freeze({
    identity: defineAutomationNodeContributionIdentity(`automation.nodes.core-flow.${kind}@${typeVersion}`),
    kind,
    typeVersion,
    library: Object.freeze({
      label,
      description,
      category,
      categoryDescription: category === 'control'
        ? 'Branch, wait, or control execution'
        : 'Browse data nodes',
      // Preserve the pre-extraction search vocabulary: the generic library
      // already indexes kind, category, and catalog label.
      keywords: Object.freeze([] as string[]),
    }),
    visual: Object.freeze({ icon }),
    ...(editor ? { editor: Object.freeze(editor) } : {}),
    ...(graphSemantics ? { graphSemantics: Object.freeze(graphSemantics) } : {}),
  });
}

const conditionEditor: AutomationNodeEditorAdapter = {
  renderParameters: ({ node,readOnly,onChange }) => createElement(
    AutomationConditionParameters,
    { node,readOnly,onChange },
  ),
  showRunParameters: (node) => node.parameters.source === 'run',
};

const runParameterSourceEditor: AutomationNodeEditorAdapter = {
  showRunParameters: (node) => node.parameters.source === 'run',
};

const conditionGraphSemantics: AutomationNodeGraphSemantics = {
  calledSuccessRoutes: () => ['true','false'],
};

const filterGraphSemantics: AutomationNodeGraphSemantics = {
  calledSuccessRoutes: () => ['kept',''],
};

const switchGraphSemantics: AutomationNodeGraphSemantics = {
  calledSuccessRoutes: (node) => {
    const ruleCount = Array.isArray(node.parameters.rules)
      && node.parameters.rules.length >= 1
      && node.parameters.rules.length <= 4
      ? node.parameters.rules.length
      : 4;
    return [...Array.from({ length: ruleCount }, (_, index) => `case-${index + 1}`),'fallback'];
  },
};

const stopAndErrorGraphSemantics: AutomationNodeGraphSemantics = {
  terminalLabel: 'Stop and Error',
};

/** Exact Merge v2 authoring policy; older Merge documents keep their schema fields unchanged. */
export function coreFlowMergeV2ParameterIsVisible(node: AutomationNode, name: string) {
  if (name === 'mode') return true;
  const mode = node.parameters.mode;
  if (mode === 'chooseBranch') {
    if (name === 'output') return true;
    return name === 'selectedInput' && node.parameters.output !== 'empty';
  }
  if (mode !== 'combine') return false;
  if (name === 'combineBy') return true;
  switch (node.parameters.combineBy) {
    case 'matchingFields':
      if (name === 'outputDataFrom') {
        return node.parameters.joinMode !== 'enrichInput1' && node.parameters.joinMode !== 'enrichInput2';
      }
      return ['fieldsToMatch','joinMode','clashHandling','mergeMode'].includes(name);
    case 'position':
      return ['includeUnpaired','clashHandling','mergeMode'].includes(name);
    case 'allCombinations':
      return ['clashHandling','mergeMode'].includes(name);
    default:
      return false;
  }
}

const mergeV2Editor: AutomationNodeEditorAdapter = {
  isParameterVisible: coreFlowMergeV2ParameterIsVisible,
  parameterOptions: ({ inputSources,baseOptions }) => ({
    ...baseOptions,
    selectedInput: inputSources.map((source) => ({ value: source.id,label: source.label })),
  }),
};

/**
 * Static Automation.Nodes.CoreFlow web leaf. Generated product roots either
 * spread this complete exact-version set into composition or never import it.
 */
export const coreFlowAutomationNodeContributions = Object.freeze([
  coreFlowContribution({
    kind: 'delay',typeVersion: 2,label: 'Delay',category: 'control',icon: Hourglass,
    description: 'Pause execution for a configured interval.',
  }),
  coreFlowContribution({
    kind: 'condition',typeVersion: 2,label: 'IF',category: 'control',icon: AutomationIfIcon,
    description: 'Route execution based on a condition.',editor: conditionEditor,
    graphSemantics: conditionGraphSemantics,
  }),
  coreFlowContribution({
    kind: 'filter',typeVersion: 1,label: 'Filter',category: 'control',icon: ListFilter,
    description: 'Keep only items that match the configured rules.',editor: runParameterSourceEditor,
    graphSemantics: filterGraphSemantics,
  }),
  coreFlowContribution({
    kind: 'merge',typeVersion: 1,label: 'Merge',category: 'control',icon: GitMerge,
    description: 'Wait for every connected data input, then combine its JSON items.',
  }),
  coreFlowContribution({
    kind: 'merge',typeVersion: 2,label: 'Merge',category: 'data',icon: GitMerge,
    description: 'Wait for every connected data input, then combine its JSON items.',editor: mergeV2Editor,
  }),
  coreFlowContribution({
    kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control',icon: Route,
    description: 'Route execution to the first matching case or the fallback output.',editor: runParameterSourceEditor,
    graphSemantics: switchGraphSemantics,
  }),
  coreFlowContribution({
    kind: 'stop-and-error',typeVersion: 1,label: 'Stop and Error',category: 'control',icon: ShieldX,
    description: 'Stop the Automation immediately and report a configured error.',
    graphSemantics: stopAndErrorGraphSemantics,
  }),
  coreFlowContribution({
    kind: 'collection.tally',typeVersion: 1,label: 'Tally',category: 'data',icon: Sigma,
    description: 'Count an upstream collection into authored groups and name the items behind each count.',
  }),
] satisfies readonly AutomationNodeWebContribution[]);
