import { createHostRoute } from '../../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../../src/domains/host/hostSystemComposition';
import { HostOverviewSystemLeaf } from '../../src/domains/host/systemLeaves/overview';

export default createHostRoute(defineHostSystemComposition({ Overview: HostOverviewSystemLeaf }));
