import { FileCode2,FileTerminal,Rocket,ServerCog,TerminalSquare } from 'lucide-react';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';
import { validateBashCommandStaticBlocklist } from './processBashStaticValidation';
import { validateROSCommandStaticBlocklist } from './processROSCommandStaticValidation';
import { validateScriptCommandStaticBlocklist } from './processScriptStaticValidation';

/**
 * Static Automation.Nodes.Process web leaf. Process catalog presets remain
 * shell-materialized from process definitions; direct Bash is a separate
 * exact runtime kind with no user-script asset indirection.
 */
export const processAutomationNodeContributions = Object.freeze([
  Object.freeze({
    identity: defineAutomationNodeContributionIdentity(
      'automation.nodes.process.process.run-definition@1',
    ),
    kind: 'process.run-definition',
    typeVersion: 1,
    library: Object.freeze({
      label: 'Run process',
      description: 'Start a trusted process definition on the execution target and wait for readiness or failure.',
      category: 'process',
      categoryDescription: 'Run trusted process definitions on execution targets',
      keywords: Object.freeze([
        'process', 'run', 'definition', 'launch', 'supervised', 'service',
        '进程', '启动', '服务',
      ]),
    }),
    visual: Object.freeze({ icon: ServerCog }),
  }),
  Object.freeze({
    identity: defineAutomationNodeContributionIdentity(
      'automation.nodes.process.process.run-bash@1',
    ),
    kind: 'process.run-bash',
    typeVersion: 1,
    library: Object.freeze({
      label: 'Run Bash command',
      description: 'Run arbitrary Bash directly on the execution target and wait for it to exit. Supports multiline commands, rosrun, and roslaunch.',
      category: 'process',
      categoryDescription: 'Run managed processes or direct Bash on execution targets',
      keywords: Object.freeze([
        'bash', 'shell', 'command', 'multiline', 'rosrun', 'roslaunch', 'terminal',
        '命令', '脚本', '运行',
      ]),
    }),
    visual: Object.freeze({ icon: TerminalSquare }),
    editor: Object.freeze({ validateParameters: validateBashCommandStaticBlocklist }),
  }),
  ...([
    ['ros1.run',2,'ROS1 Run / Launch','Select setup.bash, then enter one complete rosrun or roslaunch command.'],
    ['ros2.run',1,'ROS2 Run','Run one ROS2 command with guided setup and environment fields.'],
    ['ros2.launch',1,'ROS2 Launch','Run one ROS2 launch command with guided setup and environment fields.'],
  ] as const).map(([kind,typeVersion,label,description]) => Object.freeze({
    identity: defineAutomationNodeContributionIdentity(`automation.nodes.process.${kind}@${typeVersion}`),
    kind,
    typeVersion,
    library: Object.freeze({
      label,description,category: kind.startsWith('ros1.') ? 'ros1' : 'ros2',
      categoryDescription: 'Run ROS commands with guided parameters',
      keywords: Object.freeze([kind,label,'ros','run','launch','运行','启动']),
    }),
    visual: Object.freeze({ icon: kind.endsWith('.launch') ? Rocket : TerminalSquare }),
    editor: Object.freeze({ validateParameters: validateROSCommandStaticBlocklist }),
  })),
  ...([
    ['process.run-shell-script','Run shell script','Select and run one shell script file.'],
    ['process.run-python-script','Run Python script','Select and run one Python script file.'],
  ] as const).map(([kind,label,description]) => Object.freeze({
    identity: defineAutomationNodeContributionIdentity(`automation.nodes.process.${kind}@1`),
    kind,typeVersion: 1,
    library: Object.freeze({
      label,description,category: 'process',categoryDescription: 'Run scripts on execution targets',
      keywords: Object.freeze([kind,label,'script','file','shell','python','脚本','文件']),
    }),
    visual: Object.freeze({ icon: kind === 'process.run-shell-script' ? FileTerminal : FileCode2 }),
    editor: Object.freeze({ validateParameters: validateScriptCommandStaticBlocklist }),
  })),
] satisfies readonly AutomationNodeWebContribution[]);
