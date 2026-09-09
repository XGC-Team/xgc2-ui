import { createHostRoute } from '../../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../../src/domains/host/hostSystemComposition';
import { HostNetworkSystemLeaf } from '../../src/domains/host/systemLeaves/network';

export default createHostRoute(defineHostSystemComposition({ Network: HostNetworkSystemLeaf }));
