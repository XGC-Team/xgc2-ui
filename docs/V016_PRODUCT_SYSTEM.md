# XGC2 UI 0.16 — Product System

0.16 is not a reskin. It replaces page-by-page visual tuning with a small set
of product-system invariants shared by XGC2, Research, Agent Hub and future
Workbench products.

## 1. Visual foundation: monochrome first

The default application foundation is black / white / neutral graphite.
Brand color is not a background material and is not used to decorate ordinary
chrome. Color is reserved for:

- real data visualization and syntax,
- destructive / warning / success semantics when they change a user decision,
- media, maps and measured domain instruments.

Ordinary app, sidebar, topbar, panel, editor, input, selection and focus
materials remain neutral. Light and dark are independent optical designs, not
mechanical inversions.

## 2. Semantics own typography

Typography must never be inferred from DOM location. The same semantic role has
the same type treatment in a PageFrame, Panel, Drawer, Breadcrumb or Workbench.

Canonical roles:

- page heading,
- section heading,
- panel heading,
- body,
- secondary body,
- label,
- caption / metadata,
- code.

Products must not change a role's font size or weight because it moved into a
different container.

## 3. Layout families replace manual geometry

Products compose one of a bounded set of layout families. They do not calculate
page padding, panel nesting depth or header geometry themselves.

- `PageFrame` owns route inset, route heading, route actions and route loading
  chrome.
- `Panel` owns card chrome and automatically flattens deep nesting.
- `WorkbenchShell` owns explorer / main / inspector / bottom-panel geometry.
- `ResourceWorkbench` owns opened-resource tabs and persistent editor/viewer
  lifecycles.
- `ListPage`, table, form/settings and operator workspaces keep family-specific
  internal rhythms; they share the page origin, not arbitrary row geometry.

A Panel is a card among cards. It is not a generic wrapper around every block.
A page must never become panel > panel > panel simply to create spacing.

## 4. Async UI never replaces the application frame

The shell, navigation, page frame and stable resource geometry remain mounted
while data changes. Loading replaces the smallest meaningful content region.

Rules:

- no route-level white / black flash between normal navigations,
- no full-page spinner for data already framed by the application,
- preserve the previous usable view during background refresh where safe,
- reserve geometry for first-load content to prevent layout shift,
- use React `Activity` for expensive inactive workspaces where state should
  survive navigation,
- use Suspense boundaries only at deliberate content boundaries, never as an
  excuse to remove the shell.

## 5. Mature engines, XGC2 visual language

Do not hand-build advanced interaction engines that already have mature,
well-maintained implementations. XGC2 owns the visual system, product semantics
and adapters; proven libraries own the hard interaction/runtime machinery.

Preferred foundations:

| Capability | Foundation |
| --- | --- |
| React runtime optimization | React 19.2 + React Compiler |
| dialogs, drawers, select, combobox, popover, menu, tooltip | Base UI / Floating UI primitives |
| long lists, streaming chat, logs | TanStack Virtual |
| source / multi-file editing | Monaco Editor |
| PDF rendering / selection | PDF.js |
| terminal emulation | xterm.js |
| workflow spatial canvas | XYFlow / React Flow |

Shared XGC2 wrappers must keep these engines replaceable and prevent their
upstream visual defaults from leaking into products.

## 6. Performance is an API contract

Network/event frequency is not render frequency.

- high-frequency telemetry and streaming data publish frame-batched snapshots,
- components subscribe to the smallest useful state slice,
- long collections virtualize,
- hidden expensive workspaces are deprioritized,
- heavy engines are code-split and loaded on demand,
- layout reads and writes are coalesced,
- visible interactions have priority over background work.

Every high-level shared surface gets a benchmark for interaction latency,
render count, style/layout work and retained heap. Passing TypeScript and visual
policy is not sufficient.

## 7. No magic-number migration treadmill

Raw dimensions are allowed only for genuine domain geometry or where the Web
platform requires a literal (for example a canonical media query). Product UI
must not accumulate one-off values for page padding, toolbar height, panel
header height, tab height, menu gap or resource columns.

When a new value is genuinely needed, first ask whether it represents:

1. an existing semantic role,
2. a new reusable role across several components,
3. domain geometry that should remain explicitly local.

A token is not a hiding place for a historical pixel value.

## 8. Stability tiers

A new high-level component is not stable because it renders once.

- **specimen**: visual / interaction exploration; not exported to products,
- **preview**: real engine integration and representative product usage,
- **stable**: accessibility, keyboard, reduced motion, light/dark, mobile,
  performance benchmark, visual regression and at least two product consumers.

The 0.16 Workbench, Conversation and Manuscript layers must pass through these
tiers. Prototype implementations must not silently become family-wide API.
