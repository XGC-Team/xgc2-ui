import { WorkflowCanvasToolbar,type WorkflowCanvasToolbarAction } from '@xgc2/ui-workflow';
import { BrushCleaning,Maximize,Plus,StickyNote,ZoomIn,ZoomOut } from 'lucide-react';
import { useAutomationCanvasText } from './automationCanvasMessages';

export function AutomationCanvasControls({
  onAdd,
  onAddStickyNote,
  onZoomToFit,
  onZoomIn,
  onZoomOut,
  onTidyUp,
  addDisabled = false,
  stickyNoteDisabled = false,
  tidyDisabled = false,
  libraryOpen = false,
  controlsId = 'canvas',
}: {
  onAdd: () => void;
  onAddStickyNote: () => void;
  onZoomToFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTidyUp: () => void;
  addDisabled?: boolean;
  stickyNoteDisabled?: boolean;
  tidyDisabled?: boolean;
  libraryOpen?: boolean;
  controlsId?: string;
}) {
  const t = useAutomationCanvasText();
  const actions:WorkflowCanvasToolbarAction[] = [
    { id: 'automation-node-library-open', icon: <Plus size={17} />, label: t('Add node'), onClick: onAdd, disabled: addDisabled, pressed: libraryOpen },
    { id: 'automation-sticky-note-add', icon: <StickyNote size={16} />, label: t('Add sticky note'), title: t('Add sticky note (Shift+S)'), onClick: onAddStickyNote, disabled: stickyNoteDisabled, ariaKeyShortcuts: 'Shift+S' },
    { id: 'automation-zoom-to-fit', icon: <Maximize size={16} />, label: t('Zoom to fit'), onClick: onZoomToFit },
    { id: 'automation-zoom-in', icon: <ZoomIn size={16} />, label: t('Zoom in'), onClick: onZoomIn },
    { id: 'automation-zoom-out', icon: <ZoomOut size={16} />, label: t('Zoom out'), onClick: onZoomOut },
    { id: 'automation-tidy-up', icon: <BrushCleaning size={16} />, label: t('Tidy up'), onClick: onTidyUp, disabled: tidyDisabled },
  ];
  return <WorkflowCanvasToolbar
    actions={actions.filter((action) => !action.disabled)}
    ariaLabel={t('Canvas controls')}
    className="automation-canvas-controls"
    dataXgcId={controlsId}
    dataXgcRole="automation-canvas-controls"
  />;
}
