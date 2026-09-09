// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { ExperimentDashboardSurfaces } from './ExperimentDashboardSurfaces';
import { useExperimentSurfaceVisible } from '../experimentSurfaceVisibility';

function Viewer() {
  const visible=useExperimentSurfaceVisible();
  return <section data-visible={String(visible)}><iframe title="Lichtblick" /><input aria-label="View state" defaultValue="initial" /></section>;
}

describe('Experiment dashboard tab lifetime',() => {
  it('preserves the viewer and local state across tab switches without mounting unvisited tabs',() => {
    const dashboards=['gcs','algorithm','unvisited'].map((id) => ({ id,name:id,description:'',panels:[] }));
    const tree=(selectedId:string,experimentId='first') => <ExperimentDashboardSurfaces key={experimentId} dashboards={dashboards} selectedId={selectedId}>
      {(dashboard) => dashboard.id==='gcs' ? <Viewer /> : <div>{dashboard.name}</div>}
    </ExperimentDashboardSurfaces>;
    const { rerender }=render(tree('gcs'));
    const frame=screen.getByTitle('Lichtblick');
    fireEvent.change(screen.getByLabelText('View state'),{ target:{ value:'camera and markers' } });
    expect(screen.queryByText('algorithm')).toBeNull();
    rerender(tree('algorithm'));
    expect(frame).toBeInTheDocument();
    expect(frame).not.toBeVisible();
    expect(frame.parentElement).toHaveAttribute('data-visible','false');
    rerender(tree('gcs'));
    expect(screen.getByTitle('Lichtblick')).toBe(frame);
    expect(frame).toBeVisible();
    expect(screen.getByLabelText('View state')).toHaveValue('camera and markers');
    expect(screen.queryByText('unvisited')).toBeNull();
    rerender(tree('gcs','second'));
    expect(screen.getByTitle('Lichtblick')).not.toBe(frame);
    expect(screen.getByLabelText('View state')).toHaveValue('initial');
  });
});
