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
export { CodeBlock, DataTable, SortableDataTable, StatCard, Toolbar } from './components/DataDisplay';
export type {
  CodeBlockProps,
  DataTableColumn,
  DataTableProps,
  DataTableSelection,
  DataTableSort,
  DataTableSortDirection,
  SortableDataTableProps,
  StatCardProps,
  ToolbarProps,
} from './components/DataDisplay';
export { FormField, FormGroup, SegmentedControl, Select } from './components/FormControls';
export type {
  FormFieldProps,
  FormGroupProps,
  SegmentedControlOption,
  SegmentedControlProps,
  SelectProps,
} from './components/FormControls';
export { Input } from './components/Input';
export type { InputProps } from './components/Input';
export { Modal } from './components/Modal';
export type { ModalProps } from './components/Modal';
export { Panel } from './components/Panel';
export type { PanelProps } from './components/Panel';
export { ProductBrand } from './components/ProductBrand';
export type { ProductBrandProps } from './components/ProductBrand';
export { StatusBadge } from './components/StatusBadge';
export type { StatusBadgeProps, StatusTone } from './components/StatusBadge';
export { Tabs } from './components/Tabs';
export type { TabOption, TabsProps } from './components/Tabs';
