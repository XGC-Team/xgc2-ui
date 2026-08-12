import './styles.css';

export { AppShell, AppSidebar, ResponsiveSplit, SidebarNav, SidebarNavItem, Topbar } from './components/AppShell';
export type {
  AppShellProps,
  AppSidebarProps,
  ResponsiveSplitProps,
  SidebarNavItemProps,
  TopbarProps,
} from './components/AppShell';
export { XGC_BREAKPOINTS, XGC_MEDIA_QUERIES, useMediaQuery, useViewportMode } from './hooks/useMediaQuery';
export { AudioCaptureControl, AudioWaveform } from './components/AudioCapture';
export type {
  AudioCaptureControlProps,
  AudioCaptureState,
  AudioWaveformProps,
} from './components/AudioCapture';
export { Button, ButtonLink } from './components/Button';
export type {
  ButtonAppearance,
  ButtonLinkProps,
  ButtonProps,
  ButtonTone,
  ComponentSize,
} from './components/Button';
export { Breadcrumbs } from './components/Breadcrumbs';
export type { BreadcrumbItem, BreadcrumbsProps } from './components/Breadcrumbs';
export { ChoiceCardGroup } from './components/ChoiceCardGroup';
export type { ChoiceCardGroupProps, ChoiceCardOption } from './components/ChoiceCardGroup';
export { ColorControl, normalizeHex, XGC_COLOR_CONTROL_PRESETS } from './components/ColorControl';
export type { ColorControlProps } from './components/ColorControl';
export { CodeBlock, DataTable, Pagination, SortableDataTable, StatCard, Toolbar } from './components/DataDisplay';
export type {
  CodeBlockProps,
  DataTableColumn,
  DataTableCellProps,
  DataTableDataAttributes,
  DataTableProps,
  DataTableRowProps,
  DataTableSelection,
  DataTableSort,
  DataTableSortDirection,
  DataTableTableProps,
  PaginationLabels,
  PaginationProps,
  SortableDataTableProps,
  StatCardProps,
  ToolbarProps,
} from './components/DataDisplay';
export { ConfigSection } from './components/ConfigSection';
export type { ConfigSectionProps } from './components/ConfigSection';
export { Checkbox, FormActions, FormField, FormGroup, SegmentedControl, Select, Switch, Textarea } from './components/FormControls';
export type {
  BooleanControlProps,
  FormActionsProps,
  FormFieldProps,
  FormGroupProps,
  SegmentedControlOption,
  SegmentedControlProps,
  SelectProps,
  TextareaProps,
} from './components/FormControls';
export { EmptyState, Notice } from './components/Feedback';
export type { EmptyStateProps, NoticeProps } from './components/Feedback';
export { ConfirmationDialog } from './components/ConfirmationDialog';
export type { ConfirmationDialogProps, ConfirmationDialogRequest } from './components/ConfirmationDialog';
export { Drawer } from './components/Drawer';
export type { DrawerActionHelpers, DrawerProps } from './components/Drawer';
export { Input } from './components/Input';
export type { InputProps } from './components/Input';
export { Inline, OperatorWorkspace, ResponsiveGrid, ScrollRegion, SectionHeader, Stack } from './components/Layout';
export type {
  InlineProps,
  LayoutGap,
  OperatorWorkspaceProps,
  ResponsiveGridProps,
  ScrollRegionProps,
  SectionHeaderProps,
  StackProps,
} from './components/Layout';
export { LogTablePage } from './components/LogTablePage';
export type { LogTableColumn, LogTablePageLabels, LogTablePageProps } from './components/LogTablePage';
export {
  ListPage,
  ListPageFolderEmpty,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMain,
  ListPageItemMeta,
  ListPageRow,
  ListPageTag,
  ListPageTagButton,
  ListPageTagRow,
} from './components/ListPage';
export type { ListPageFolder, ListPageItemIcon, ListPageProps } from './components/ListPage';
export { Modal } from './components/Modal';
export type { ModalProps } from './components/Modal';
export { Panel } from './components/Panel';
export type { PanelProps } from './components/Panel';
export { PanelViewSwitcher } from './components/PanelViewSwitcher';
export type {
  PanelViewAppearance,
  PanelViewIcon,
  PanelViewItem,
  PanelViewPresentation,
  PanelViewSwitcherProps,
} from './components/PanelViewSwitcher';
export { ProductBrand } from './components/ProductBrand';
export type { ProductBrandProps } from './components/ProductBrand';
export { ProgressBar } from './components/ProgressBar';
export type {
  ProgressBarAppearance,
  ProgressBarProps,
  ProgressBarSize,
  ProgressBarTone,
} from './components/ProgressBar';
export { SelectMenu } from './components/SelectMenu';
export type { SelectMenuOption, SelectMenuProps } from './components/SelectMenu';
export { StatusText } from './components/StatusText';
export type { StatusTextProps, StatusTone } from './components/StatusText';
export { DescriptionItem, DescriptionList, ResourceMeter, SettingRow, SettingsList } from './components/StructuredData';
export type {
  DescriptionItemProps,
  DescriptionListProps,
  ResourceMeterProps,
  SettingRowProps,
  SettingsListProps,
} from './components/StructuredData';
export { Tabs } from './components/Tabs';
export type { TabOption, TabsProps } from './components/Tabs';
export { WorkspaceTabs } from './components/WorkspaceTabs';
export type { WorkspaceTabItem, WorkspaceTabsProps } from './components/WorkspaceTabs';
export { WorkflowStatusCard } from './components/WorkflowStatusCard';
export type {
  WorkflowStatusCardLayout,
  WorkflowStatusCardProgress,
  WorkflowStatusCardProps,
  WorkflowStatusCardTone,
} from './components/WorkflowStatusCard';
export { Tooltip } from './components/Tooltip';
export type { TooltipProps } from './components/Tooltip';
export { useConfirmationDialog } from './hooks/useConfirmationDialog';
