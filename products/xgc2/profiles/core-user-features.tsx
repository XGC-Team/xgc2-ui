import { lazy } from 'react';
import {
  CirclePlay,
  Cpu,
  FlaskConical,
  Folder,
  LandPlot,
  MonitorCog,
  ScrollText,
  Server,
  Settings,
  Share2,
  ShieldCheck,
  Terminal,
  Workflow,
  Wrench,
} from 'lucide-react';
import type {
  ProductRouteSurfacePolicy,
  ProductWebComposition,
} from '../src/shared/productWebComposition';
import { assembleProductWebComposition, createPreloadableProductRoute } from '../src/shared/productWebComposition';
import {
  emptyAutomationNodeWebComposition,
  type AutomationNodeWebComposition,
} from '../src/domains/automation/nodes/automationNodeWebComposition';
import { createHostRoute } from '../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../src/domains/host/hostSystemComposition';
import { HostFilesSystemLeaf } from '../src/domains/host/systemLeaves/files';
import { HostNetworkSystemLeaf } from '../src/domains/host/systemLeaves/network';
import { HostOverviewSystemLeaf } from '../src/domains/host/systemLeaves/overview';
import { HostProcessesSystemLeaf } from '../src/domains/host/systemLeaves/processes';
import { experimentSharedSurfacesContribution } from '../src/domains/experiment/experimentSharedSurfacesContribution';
import { isAgentEffective } from '../src/domains/managedHost/managedHostPublic';
const loadExperimentRoute = () => import('../src/domains/experiment/ExperimentRoute').then((module) => ({ default: module.ExperimentRoute }));
const loadRobotAssetsRoute = () => import('../src/domains/robot/RobotAssetsRoute').then((module) => ({ default: module.RobotAssetsRoute }));
const loadVenueAssetsRoute = () => import('../src/domains/venue/VenueAssetsRoute').then((module) => ({ default: module.VenueAssetsRoute }));
const loadOperationsRoute = () => import('../src/domains/execution/OperationsRoute').then((module) => ({ default: module.OperationsRoute }));
const loadToolboxRoute = () => import('../src/domains/toolbox/ToolboxRoute').then((module) => ({ default: module.ToolboxRoute }));
const loadSettingsRoute = () => import('../src/domains/settings/SettingsRoute').then((module) => ({ default: module.SettingsRoute }));
const loadSharingRoute = () => import('../src/domains/access/SharingRoute').then((module) => ({ default: module.SharingRoute }));
const experimentRoute = createPreloadableProductRoute(loadExperimentRoute);
const robotAssetsRoute = createPreloadableProductRoute(loadRobotAssetsRoute);
const venueAssetsRoute = createPreloadableProductRoute(loadVenueAssetsRoute);
const operationsRoute = createPreloadableProductRoute(loadOperationsRoute);
const toolboxRoute = createPreloadableProductRoute(loadToolboxRoute);
const settingsRoute = createPreloadableProductRoute(loadSettingsRoute);
const sharingRoute = createPreloadableProductRoute(loadSharingRoute);
const AppearanceSettingsSection = lazy(() => import('../src/domains/settings/AppearanceSettingsSection').then((module) => ({ default: module.AppearanceSettingsSection })));
const TimeSettingsSection = lazy(() => import('../src/domains/settings/TimeSettingsSection').then((module) => ({ default: module.TimeSettingsSection })));
const FieldTooltipsSettingsSection = lazy(() => import('../src/domains/settings/FieldTooltipsSettingsSection').then((module) => ({ default: module.FieldTooltipsSettingsSection })));
const ToolsSettingsSection = lazy(() => import('../src/domains/settings/ToolsSettingsSection').then((module) => ({ default: module.ToolsSettingsSection })));
const AgentProvidersSettingsSection = lazy(() => import('../src/domains/groundStationInteraction/AgentProvidersSettingsSection').then((module) => ({ default: module.AgentProvidersSettingsSection })));
const DeviceSignInSettingsSection = lazy(() => import('../src/domains/operatorAccess/DeviceSignInSettingsSection').then((module) => ({ default: module.DeviceSignInSettingsSection })));

// System.HostLogs, System.SSHService, and System.Firewall are intentionally
// unwired on the product surface. Host log / sshd / firewall leaf modules stay
// for fixtures; Terminal.RemoteSSH remains the SSH login surface.
const HostRoute = createHostRoute(defineHostSystemComposition({
  Overview: HostOverviewSystemLeaf,
  Files: HostFilesSystemLeaf,
  Processes: HostProcessesSystemLeaf,
  Network: HostNetworkSystemLeaf,
}));

const label = (en: string,zh: string) => ({ 'en-US': en,'zh-CN': zh } as const);

function surface(
  productFeatures: readonly string[],
  targetAction: string,
  targetCapabilities: readonly string[],
  remoteVisibility: ProductRouteSurfacePolicy['remoteVisibility'],
  remoteManagedHostAdmission: ProductRouteSurfacePolicy['remoteManagedHostAdmission'],
): ProductRouteSurfacePolicy {
  return {
    productFeatures,
    targetAction,
    targetCapabilities,
    remoteVisibility,
    remoteManagedHostAdmission,
  };
}

const localCoreOnly = () => false;
const agentOperations = (profile: unknown) => (
  isAgentEffective(profile) && profile.Surfaces.Operations
);
const agentAutomations = (profile: unknown) => (
  isAgentEffective(profile) && profile.Surfaces.Automations
);
const agentTerminal = (profile: unknown) => (
  isAgentEffective(profile) && profile.Surfaces.Terminal
);
const agentSystem = (profile: unknown) => (
  isAgentEffective(profile) && profile.Surfaces.System
);

export const coreUserFeatureModulePrefixes = {
  'Home.RecordingLibrary': [
    'src/domains/home/homePublic',
    'src/domains/home/RecordingLibrary',
    'src/domains/home/useRecordingLibrary',
    'src/domains/home/recordingLibraryCopy',
  ],
  'RecordingOpenFolder': [
    'src/app/home/RecordingOpenFolderActionContribution',
    'src/app/home/RecordingOpenFolderAction',
    'src/domains/home/homePublic',
  ],
  'Product.AppStore': [
    'src/domains/appstore/',
  ],
  'Product.Docker': [
    'src/domains/container/',
  ],
  'Product.Operations': [
    'src/domains/execution/operationsProductContribution',
    'src/domains/execution/operationsProductIdentity',
  ],
  'Audit.TaskLogs': [
    'src/domains/audit/tasklogs/',
  ],
  'System.Overview': ['src/domains/host/systemLeaves/overview'],
  'System.Files': ['src/domains/host/systemLeaves/files'],
  'System.Processes': ['src/domains/host/systemLeaves/processes'],
  'System.Network': ['src/domains/host/systemLeaves/network'],
  // Prefixes retained for the denied-owner module-absence gate only.
  'System.HostLogs': ['src/domains/host/systemLeaves/hostLogs'],
  'System.SSHService': ['src/domains/host/systemLeaves/sshService'],
  'System.Firewall': ['src/domains/host/systemLeaves/firewall'],
  'Terminal.LocalShell': ['src/domains/terminal/leaves/localShell'],
  'Terminal.RemoteSSH': [
    'src/domains/terminal/leaves/remoteSsh',
    'src/domains/terminal/TerminalHostsView',
  ],
  'Product.UserScripts': [
    'src/domains/terminal/leaves/userScripts',
    'src/domains/terminal/useTerminalUserScripts',
    'src/domains/usernode/',
  ],
  'Core.Access': [
    'src/domains/operatorAccess/',
    'src/domains/access/entry/',
    'src/domains/access/accessTypes',
  ],
  'Product.VenueAssets': [
    'src/domains/venue/',
  ],
  'Product.Sharing': [
    'src/domains/access/SharingRoute',
    'src/domains/access/CollaborationAccessPage',
    'src/domains/access/accessService',
    'src/domains/access/useAccessEntries',
    'src/domains/access/accessLink',
    'src/domains/operatorAccess/DeviceSignInSettingsSection',
    'src/domains/operatorAccess/OperatorDeviceSignIn',
  ],
  'Experiment.Workspace': [
    'src/domains/experiment/experimentSharedSurfacesContribution',
    'src/panels/camera/SharedCameraSurface',
    'src/panels/camera/SharedCalibrationSurface',
    'src/panels/robot/SharedRobotRemoteControlSurface',
  ],
  'Developer.MarkPrompt': ['src/devtools/mark-prompt/'],
  'Developer.ControlGallery': ['src/devtools/control-gallery/'],
} as const;

export const coreUserFeatureEnabledOwners = [
  'Home.RecordingLibrary','RecordingOpenFolder',
  'Experiment.Workspace','Robot.PX4Multirotor.Asset','Robot.ScoutMini.Asset',
  'Robot.MecanumUGV.Asset','Automation','Operations','System','Terminal','Settings',
  'System.Overview','System.Files','System.Processes',
  'System.Network',
  'Terminal.LocalShell','Terminal.RemoteSSH','Product.UserScripts',
  'Core.Access','Product.Sharing','Product.VenueAssets',
] as const;

/**
 * System product leaves closed on Core profiles (UI surface only).
 * Leaf modules remain importable for domain tests/fixtures.
 */
export const coreUserFeatureDeniedSystemServiceOwners = [
  'System.HostLogs',
  'System.SSHService',
  'System.Firewall',
] as const;

export function createCoreUserFeatureComposition(options: {
  id: string;
  agentLinkComputeTargets: boolean;
  automationNodeComposition?: AutomationNodeWebComposition;
  developer?: ProductWebComposition['developer'];
}): ProductWebComposition {
  const automationNodeComposition = options.automationNodeComposition
    ?? emptyAutomationNodeWebComposition();
  const loadAutomationsRoute = () => import('../src/domains/automation/createAutomationsRoute')
    .then((module) => ({
      default: module.createAutomationsRoute(automationNodeComposition),
    }));
  const automationsRoute = createPreloadableProductRoute(loadAutomationsRoute);
  /** Reference core profiles enable LocalShell + RemoteSSH + UserScripts. */
  const loadTerminalRoute = async () => {
    const [routeModule,compositionModule,localShellModule,remoteSshModule,userScriptsModule] = await Promise.all([
      import('../src/domains/terminal/createTerminalRoute'),
      import('../src/domains/terminal/terminalComposition'),
      import('../src/domains/terminal/leaves/localShell'),
      import('../src/domains/terminal/leaves/remoteSsh'),
      import('../src/domains/terminal/leaves/userScripts'),
    ]);
    return {
      default: routeModule.createTerminalRoute(compositionModule.defineTerminalComposition({
        LocalShell: localShellModule.TerminalLocalShellLeaf,
        RemoteSSH: remoteSshModule.TerminalRemoteSSHLeaf,
        UserScripts: userScriptsModule.TerminalUserScriptsLeaf,
      })),
    };
  };
  const terminalRoute = createPreloadableProductRoute(loadTerminalRoute);
  const routes: ProductWebComposition['routes'] = [
    {
      page: 'experiment',
      component: experimentRoute.component,
      preload: experimentRoute.preload,
      surface: surface(['experiments'],'experiment management',['experiment.read','experiment.manage'],'capability',localCoreOnly),
    },
    {
      page: 'robotAssets',
      component: robotAssetsRoute.component,
      preload: robotAssetsRoute.preload,
      surface: surface(['robot-assets'],'robot asset management',['robot.read','robot.manage'],'control-plane',localCoreOnly),
    },
    {
      page: 'venueAssets',
      component: venueAssetsRoute.component,
      preload: venueAssetsRoute.preload,
      // Same advertised product feature as Robot assets. Core does not emit a
      // separate venue-assets capability; the scene list itself is recordings.read.
      surface: surface(['robot-assets'],'venue asset catalog',['robot.read','recordings.read'],'control-plane',localCoreOnly),
    },
    // Calibration assets catalog is not a primary operator surface: results are
    // written by experiment calibration.commit only, so the sidebar list stays empty
    // until then and is not product-routed here.
    {
      page: 'automations',
      component: automationsRoute.component,
      preload: automationsRoute.preload,
      surface: surface(['automations'],'automation management',['automations.read','automations.edit','automations.run'],'capability',agentAutomations),
    },
    {
      page: 'sharing',
      component: sharingRoute.component,
      preload: sharingRoute.preload,
      surface: surface(['settings'],'collaboration sharing management',['access.manage'],'local-only',localCoreOnly),
    },
    {
      page: 'operations',
      component: operationsRoute.component,
      preload: operationsRoute.preload,
      surface: surface(['operations'],'process operations',['operations.process.read','operations.process.control'],'capability',agentOperations),
    },
    {
      page: 'system',
      component: HostRoute,
      surface: surface(['system'],'host system access',['host.manage','host.read','linux.manage'],'capability',agentSystem),
      sectionRoutes: {
        maintenance: {
          component: toolboxRoute.component,
          preload: toolboxRoute.preload,
          permissionSurface: 'maintenance',
          surface: surface(
            ['system','maintenance'],
            'registered maintenance',
            ['toolbox.maintenance'],
            'capability',
            agentSystem,
          ),
        },
      },
    },
    {
      page: 'terminal',
      component: terminalRoute.component,
      preload: terminalRoute.preload,
      surface: surface(
        ['terminal'],
        'terminal access',
        ['terminal.manage','terminal.access','ssh.manage','linux.manage'],
        'local-only',
        agentTerminal,
      ),
    },
    {
      page: 'settings',
      component: settingsRoute.component,
      preload: settingsRoute.preload,
      surface: surface(['settings'],'settings access',['access.manage'],'control-plane',localCoreOnly),
    },
  ];

  const primary: ProductWebComposition['navigation']['primary'] = [
    { id: 'experiment',label: label('Experiments','实验'),icon: FlaskConical },
    { id: 'robotAssets',label: label('Robot assets','机器人资产'),icon: ShieldCheck },
    { id: 'venueAssets',label: label('Scene assets','场地资产'),icon: LandPlot },
    { id: 'automations',label: label('Automations','自动化'),icon: Workflow },
    { id: 'sharing',label: label('Sharing','协作授权'),icon: Share2 },
  ];

  return assembleProductWebComposition({
    id: options.id,
    agentLinkComputeTargets: options.agentLinkComputeTargets,
    routes,
    navigation: {
      defaultPage: routes[0]!.page,
      primary,
      operations: [
        { id: 'system',label: label('System','系统'),icon: Server },
        { id: 'terminal',label: label('Terminal','终端'),icon: Terminal },
        { id: 'operations',label: label('Operations','运行管理'),icon: CirclePlay },
        { id: 'settings',label: label('Settings','设置'),icon: Settings },
      ],
      sections: {
        terminal: [
          { id: 'terminal',label: label('Terminal','终端'),icon: Terminal },
          { id: 'hosts',label: label('Hosts','主机'),icon: Server },
          { id: 'usernode',label: label('User scripts','用户脚本'),icon: ScrollText },
        ],
        system: [
          { id: 'overview',label: label('Overview','概览'),icon: MonitorCog },
          { id: 'files',label: label('Files','文件'),icon: Folder },
          { id: 'processes',label: label('Runtime','运行时'),icon: Cpu },
          { id: 'host',label: label('Host','主机'),icon: Server },
          { id: 'maintenance',label: label('Maintenance','维护'),icon: Wrench },
        ],
      },
      sectionDefaults: { terminal: 'terminal',system: 'overview' },
    },
    settings: {
      sections: [
        { id: 'device-sign-in',component: DeviceSignInSettingsSection },
        { id: 'appearance',component: AppearanceSettingsSection },
        { id: 'time',component: TimeSettingsSection },
        { id: 'field-tooltips',component: FieldTooltipsSettingsSection },
        ...(options.developer?.markPrompt
          ? [{ id: 'tools',component: ToolsSettingsSection }]
          : []),
        { id: 'agent-providers',component: AgentProvidersSettingsSection },
      ],
    },
    developer: options.developer ?? {},
  },experimentSharedSurfacesContribution);
}
