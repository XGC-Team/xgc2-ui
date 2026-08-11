# @xgc2/ui-react

Reusable React components for XGC2 applications.

```tsx
import '@xgc2/ui-react/styles.css';
import {
  AudioCaptureControl,
  AppShell,
  AppSidebar,
  Button,
  FormField,
  ProductBrand,
  Select,
  SidebarNav,
  SidebarNavItem,
  Topbar,
} from '@xgc2/ui-react';
```

`AppShell` and its navigation components are deliberately router-neutral. A consumer supplies active state and navigation callbacks, so React Router, URL state, and embedded applications can share the same shell.

`AppSidebar` requires a compact `brandMark`; it remains visible and acts as the expand affordance in collapsed mode.

`AudioWaveform` and `AudioCaptureControl` own reusable recording presentation only. The consuming product remains responsible for microphone permissions, transport, transcription, and capture state transitions.

`FormField`, `Input`, `Select`, and `SegmentedControl` share one control geometry and accessible native semantics. `ProductBrand` gives every application the same topbar identity structure.

React and React DOM are peer dependencies to guarantee that a consuming application owns the single React runtime.
