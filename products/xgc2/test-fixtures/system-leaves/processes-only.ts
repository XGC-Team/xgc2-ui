import { createHostRoute } from '../../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../../src/domains/host/hostSystemComposition';
import { HostProcessesSystemLeaf } from '../../src/domains/host/systemLeaves/processes';

export default createHostRoute(defineHostSystemComposition({ Processes: HostProcessesSystemLeaf }));
