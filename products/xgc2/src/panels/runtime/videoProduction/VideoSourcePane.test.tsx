// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { ROSBagRecording } from '../../../domains/recording/recordingPublic';
import { VideoSourcePane } from './VideoSourcePane';
import { groupVideoSources } from './videoSourceModel';

const bag = (id: string,overrides: Partial<ROSBagRecording> = {}): ROSBagRecording => ({
  id,name:`${id}.bag`,path:`/archive/opaque-folder/${id}.bag`,size:1024,createdAt:'2040-01-01T00:00:00Z',
  experimentId:'experiment-one',experimentName:'Four robots',...overrides,
});

describe('recording sources',() => {
  it('orders by recording start, preserves distinct Experiment IDs and leaves unknown dates last',() => {
    const older = bag('a-old',{ startedAt:'2026-09-18T10:00:00Z' });
    const recent = bag('z-recent',{ startedAt:'2026-09-20T10:00:00+08:00',createdAt:'2000-01-01T00:00:00Z' });
    const unknown = bag('0-unknown');
    const other = bag('another',{ experimentId:'experiment-two',startedAt:'2026-09-17T10:00:00Z' });
    const groups = groupVideoSources([older,unknown,other,recent]);
    expect(groups.map((group) => group.key)).toEqual(['experiment-one','experiment-two']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['z-recent','a-old','0-unknown']);
    expect(unknown.startedAt).toBeUndefined();
  });

  it('shows source names and honest missing metadata without filesystem plumbing; refresh preserves selection',() => {
    const onSelect = vi.fn(),onRefresh = vi.fn();
    const initial = bag('recording',{ runMode:'hybrid' });
    const props = { id:'source',bags:[initial],selectedId:initial.id,busy:false,loaded:true,scope:'current' as const,onScopeChange:vi.fn(),onSelect,onRefresh,onLoadOlder:vi.fn() };
    const view = render(<VideoSourcePane {...props} />);
    expect(screen.getByRole('button',{ name:'Four robots' })).toBeTruthy();
    expect(screen.getByRole('button',{ name:/recording\.bag.*Hybrid.*Recording time unknown/ }).getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).not.toContain('/archive');
    expect(view.container.textContent).not.toContain('opaque-folder');
    fireEvent.click(screen.getByRole('button',{ name:'Refresh archive' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    view.rerender(<VideoSourcePane {...props} bags={[bag('newer',{ startedAt:'2026-09-20T10:00:00Z' }),initial]} />);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{ name:/^recording\.bag/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('distinguishes loading from empty and changes scope without selecting a recording',() => {
    const onSelect = vi.fn(),onScopeChange = vi.fn();
    const props = { id:'source',bags:[],selectedId:'previous',busy:true,loaded:false,scope:'current' as const,onScopeChange,onSelect,onRefresh:vi.fn(),onLoadOlder:vi.fn() };
    const view = render(<VideoSourcePane {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading recordings');
    expect(screen.queryByText('No archived bags')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'All recordings' }));
    expect(onScopeChange).toHaveBeenCalledWith('all');
    expect(onSelect).not.toHaveBeenCalled();
    view.rerender(<VideoSourcePane {...props} busy={false} loaded />);
    expect(screen.getByText('No archived bags')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
