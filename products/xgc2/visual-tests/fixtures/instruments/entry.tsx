// Standalone entry for the instrument fixture surface. Mirrors src/main.tsx's
// bootstrap order (skin init, vendor/app styles) but mounts only the fixture
// page — no product routes, providers beyond library defaults, or API wiring.
// Loaded by the review driver through the real Vite transform at
// /visual-tests/fixtures/instruments/entry.tsx.

import { initializeSkin } from '@xgc2/ui-react';
import { createRoot } from 'react-dom/client';
import { xgcSkinStorageOptions } from '../../../src/app/skin';
import '../../../src/styles/vendor.css';
import '../../../src/styles/app.css';
import { InstrumentFixtures } from './InstrumentFixtures';

initializeSkin(xgcSkinStorageOptions);

const container = document.getElementById('root');
if (!container) throw new Error('instrument fixture root container is missing');
createRoot(container).render(<InstrumentFixtures />);
