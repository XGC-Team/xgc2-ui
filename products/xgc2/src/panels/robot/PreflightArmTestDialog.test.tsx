// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi,beforeEach } from 'vitest';
import type { AutomationRunDetail } from '../../domains/automation/automationPublic';
import type { PanelActionPortRuntime } from '../types';
import { PreflightArmTestDialog } from './PreflightArmTestDialog';
import { armTestRows,preflightRoster } from './preflightArmTestModel';
import { testPanelExecution } from '../../test/panelExecutionTestSupport';

const interaction = vi.hoisted(() => ({ decisions:[] as unknown[],respond:vi.fn(),claim:vi.fn() }));
vi.mock('../../domains/robot/robotPublic',() => ({ useRobotText:() => (text:string) => text }));
vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic',() => ({
  useGroundStationInteractionScope:() => ({ interactions:{ chatDecisions:interaction.decisions,respond:interaction.respond } }),
  useGroundStationDecisionPresentation:interaction.claim,
}));
const invocation = { id:'test-run',status:'running' as const,revision:4 };
function fixture(status='running',rows:unknown[]=[{ robotId:'uav1',status:'pending' },{ robotId:'uav2',status:'pending' }]) {
  const detail = {
    run:{ ...invocation,parameters:{ robotIds:['uav1','uav2'] } },
    nodeSummaries:[{ nodeId:'arm-observe',kind:'robot.operation-observe',status,progress:{ rows } }],
    invocations:[],loading:false,error:'',
  } as unknown as AutomationRunDetail;
  const automation = testPanelExecution({ 'test-run':detail },{ loadRunDetail:vi.fn().mockResolvedValue(detail),retainRunDetail:vi.fn(() => vi.fn()),retainRunObservation:vi.fn(() => vi.fn()) });
  const port = { control:vi.fn().mockResolvedValue(undefined),activeInvocation:invocation } as unknown as PanelActionPortRuntime;
  const props = { targetId:'local',automation,port,invocation,robotIds:['unrelated-selection'],onClose:vi.fn() };
  return { props,detail,port };
}
beforeEach(() => { interaction.decisions=[];interaction.respond.mockReset();interaction.respond.mockResolvedValue({}); });
describe('preflight arm test dialog',() => {
  it('renders the frozen roster and advances individual circles from backend progress',() => {
    const { props,detail } = fixture();
    const view = render(<PreflightArmTestDialog {...props} />);
    expect(screen.queryByText('unrelated-selection')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.is-testing')).toHaveLength(2);
    detail.nodeSummaries[0] = { ...detail.nodeSummaries[0],progress:{ rows:[{ robotId:'uav1',status:'passed' },{ robotId:'uav2',status:'failed',detail:'Timed out waiting for observed state' }] } };
    view.rerender(<PreflightArmTestDialog {...props} />);
    expect(screen.getByText('Armed state confirmed')).toBeInTheDocument();
    expect(screen.getByText('Not confirmed · may need reboot')).toBeInTheDocument();
    expect(document.querySelectorAll('.is-testing')).toHaveLength(0);
  });
  it('uses the exact pending decision for authorization and does not infer approval',async () => {
    const { props } = fixture('pending');
    const decision = { id:'approval',revision:7,status:'open',origin:{ runId:'test-run' },payload:{ decision:{ approveLabel:'Authorize arm test' } } };
    interaction.decisions=[decision];
    render(<PreflightArmTestDialog {...props} />);
    expect(interaction.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Authorize arm test' }));
    await waitFor(() => expect(interaction.respond).toHaveBeenCalledWith(decision,'approved'));
    expect(props.port.control).not.toHaveBeenCalled();
  });
  it('cancels a running observation and retains the dialog for cleanup',async () => {
    const { props } = fixture();render(<PreflightArmTestDialog {...props} />);
    fireEvent.click(screen.getByRole('button',{ name:'End and disarm' }));
    await waitFor(() => expect(props.port.control).toHaveBeenCalledWith(expect.objectContaining({ id:'test-run' }),'cancel',expect.any(String)));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Disarming tested robots…')).toBeInTheDocument();
  });
  it('declining a result decision follows normal cleanup and never requests reboot',async () => {
    const { props } = fixture('succeeded',[{ robotId:'uav1',status:'failed' }]);
    const decision = { id:'reboot',revision:2,status:'open',origin:{ runId:'test-run' },payload:{ decision:{ approveLabel:'Reboot failed robots' } } };
    interaction.decisions=[decision];render(<PreflightArmTestDialog {...props} />);
    fireEvent.click(screen.getByRole('button',{ name:'End and disarm' }));
    await waitFor(() => expect(interaction.respond).toHaveBeenCalledWith(decision,'rejected'));
    expect(props.port.control).not.toHaveBeenCalled();
  });
  it('keeps cleanup errors visible and closes only after the run terminates',async () => {
    const { props,detail } = fixture('succeeded',[{ robotId:'uav1',status:'passed' }]);
    detail.run!.status='failed';detail.run!.revision=5;detail.nodeSummaries.push({ ...detail.nodeSummaries[0],nodeId:'disarm-observe',status:'succeeded',error:'Cleanup incomplete',output:{ rows:[{ robotId:'uav1',status:'failed' }] } });
    render(<PreflightArmTestDialog {...props} />);
    expect(screen.getByText('Disarm not confirmed')).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('Cleanup incomplete');
    fireEvent.click(screen.getByRole('button',{ name:'Close' }));expect(props.onClose).toHaveBeenCalled();
  });
  it('never controls an unrelated newer invocation when an older dialog is open',async () => {
    const { props } = fixture();props.port.activeInvocation={ id:'another-test',status:'running',revision:99 };
    render(<PreflightArmTestDialog {...props} />);fireEvent.click(screen.getByRole('button',{ name:'End and disarm' }));
    await waitFor(() => expect(props.port.control).toHaveBeenCalledWith(expect.objectContaining({ id:'test-run' }),'cancel',expect.any(String)));
  });
  it('reads only well-formed result rows and preserves empty frozen selections',() => {
    const { detail } = fixture();detail.run!.parameters.robotIds=[];
    expect(preflightRoster(detail,['other'])).toEqual([]);
    expect(armTestRows({ ...detail.nodeSummaries[0],output:{ rows:[null,{ robotId:'forged',status:'healthy' }] } })).toEqual([]);
  });
});
