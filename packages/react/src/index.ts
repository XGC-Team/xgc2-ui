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
export { CodeBlock, DataTable, Pagination, SortableDataTable, StatCard, Toolbar } from './components/DataDisplay';
export type {
  CodeBlockProps,
  DataTableColumn,
  DataTableProps,
  DataTableSelection,
  DataTableSort,
  DataTableSortDirection,
  PaginationLabels,
  PaginationProps,
  SortableDataTableProps,
  StatCardProps,
  ToolbarProps,
} from './components/DataDisplay';
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
export { Modal } from './components/Modal';
export type { ModalProps } from './components/Modal';
export { Panel } from './components/Panel';
export type { PanelProps } from './components/Panel';
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
export { StatusBadge, StatusText } from './components/StatusBadge';
export type { StatusBadgeProps, StatusTextProps, StatusTone } from './components/StatusBadge';
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
export { Tooltip } from './components/Tooltip';
export type { TooltipProps } from './components/Tooltip';
export { useConfirmationDialog } from './hooks/useConfirmationDialog';
