import { createHostRoute } from '../../src/domains/host/createHostRoute';
import { defineHostSystemComposition } from '../../src/domains/host/hostSystemComposition';

export default createHostRoute(defineHostSystemComposition({}));
