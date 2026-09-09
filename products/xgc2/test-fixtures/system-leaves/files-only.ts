import { createHostRoute } from '../../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../../src/domains/host/hostSystemComposition';
import { HostFilesSystemLeaf } from '../../src/domains/host/systemLeaves/files';

export default createHostRoute(defineHostSystemComposition({ Files: HostFilesSystemLeaf }));
