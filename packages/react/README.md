# @xgc2/ui-react

Reusable React components for XGC2 applications.

```tsx
import '@xgc2/ui-react/styles.css';
import {
  AudioCaptureControl,
  AppShell,
  AppSidebar,
  Button,
  Drawer,
  FormField,
  OperatorWorkspace,
  Select,
  SidebarNav,
  SidebarNavItem,
  Topbar,
} from '@xgc2/ui-react';
```

`AppShell` and its navigation components are deliberately router-neutral. A consumer supplies active state and navigation callbacks, so React Router, URL state, and embedded applications can share the same shell.

`AppSidebar` requires a compact `brandMark`; it remains visible and acts as the expand affordance in collapsed mode.

`AudioWaveform` and `AudioCaptureControl` own reusable recording presentation only. Consumers pass normalized levels derived from the audio samples actually being captured; absent samples render a quiet baseline and never a synthetic recording animation. The consuming product remains responsible for microphone permissions, transport, transcription, and capture state transitions.

`FormField`, `FormGroup`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `ColorControl`, `ChoiceCardGroup`, `SegmentedControl`, and `Tabs` share one control geometry and accessible semantics. `ColorControl` owns the themed native picker, validated hex draft, and common palette. `ChoiceCardGroup` is the keyboard-operable radio pattern for options that need a visual preview; selection always uses a complete enclosing surface, never a left stripe. Use `FormGroup` for button groups and compound controls. `Tabs` owns the tablist/tab roles, arrow-key navigation, compact density, and complete-background selection treatment.

`Topbar` deliberately exposes `brand` or `title`, optional navigation, and actions: put one product identity on the left and only high-value interactive controls on the right. It does not accept center content, subtitles, helper copy, or decorative healthy-state labels such as Ready/Online. Put diagnostic status in the relevant content surface, and render it only when it informs an operator decision.

`StatusText` renders decision-relevant state as compact, undecorated text. It intentionally has no filled background, enclosing border, capsule radius, decorative dot, LED, glow, or halo. Normal and terminal states such as connected, ready, completed, and cancelled stay neutral; progress is restrained informational text, while warnings and failures may reinforce their wording with semantic text color. `Notice` keeps its enclosing surface neutral in every tone and reserves color for the heading. `EmptyState` describes absence rather than pretending to be a health signal.

`ConversationRegion`, `ConversationMessage`, `ConversationComposer`, and
`AgentActivity` form the shared human/agent interaction surface. They own the
live-log and internal-scroll semantics, speaker alignment, author/time
placement, Enter/Shift+Enter/IME composer behavior, neutral tool/request
surfaces, and reduced motion. Products supply messages, domain actions,
follow-tail policy, transport, and localized `speakerLabel` text when the
default Agent/Operator/System wording is unsuitable. They must not rebuild chat bubbles, frame
avatars as colored state discs, tint an activity card by status, or add pills,
glowing dots, and decorative connection labels.

`SelectableList`, `Disclosure`, `MarkdownContent`, `ActionMenu`, and `Popover`
own the reusable listbox, disclosure, sanitized Markdown/code, menu, and
anchored-overlay interactions. `FormSection`, `InputActionControl`,
`Vector3Control`, `TextPromptDialog`, and `useTextPromptDialog` own recurring
form composition. Products supply domain data and actions without copying the
keyboard, portal, placement, focus, theme, or geometry behavior.
Nested overlays share one topmost stack: the innermost open SelectMenu,
Popover, Tooltip, Modal, Drawer, or mobile AppSidebar consumes Escape first and
restores its trigger where applicable. A later Escape may dismiss its owner;
nondismissible layers block dismissal without making portaled descendants lose
their focus ownership. Modal and Drawer focus containment leaves native Tab
traversal inside those owned portals intact.

`AppSidebar` drawer mode becomes inert and hidden from assistive technology
when closed on the generated mobile breakpoint. While open, Escape dismisses
it, Tab and Shift+Tab stay trapped inside it, and focus returns to the trigger.
`useSkin` treats its `storageKey` as the sole persistence authority and keeps
same-document hooks and external storage events synchronized.

`Toolbar`, `StatCard`, `DataTable`, `Pagination`, `LogTablePage`, `ListPage`, `ConfigSection`, `PanelViewSwitcher`, `WorkflowStatusCard`, structured information rows, settings rows, resource meters, and `CodeBlock` cover recurring operational data layouts while leaving data fetching and mutations to consumers. `Breadcrumbs` owns compact hierarchy navigation, while `ButtonLink` gives native navigation links the same geometry as actions.

`Stack`, `Inline`, `ResponsiveGrid`, `ScrollRegion`, `OperatorWorkspace`, and `SectionHeader` own common spacing and fixed-workspace behavior. `Drawer` owns the right-side overlay, fixed header, internally scrolling body, mobile width, focus behavior, and optional dirty-data confirmation. Consumers provide domain form contents and save behavior.

Page and first-level panel chrome use the shared `--size-header-page` and `--size-header-panel` tokens. Panel chrome follows the compact 34px XGC2 experiment-panel density. `CodeBlock` uses a quiet 24px metadata/copy row inside the code surface; it must not resemble another panel topbar. Its `viewport="compact"` option is the shared bounded-height choice for command lists that must remain inside a one-screen workspace.

React and React DOM are peer dependencies to guarantee that a consuming application owns the single React runtime.
