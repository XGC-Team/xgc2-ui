# @xgc2/ui-workflow

Reusable spatial editor foundation for workflow, topology, orchestration, and other node/edge frontends.

The package owns the canvas viewport, React Flow interaction defaults, grid, selection surface, drag/drop coordinate conversion, empty overlay, canvas and element toolbars, and editable sticky notes. A product supplies its node and edge renderers, domain schemas, validation, execution state, persistence, and API operations.

`WorkflowNodeSurface` is the neutral shell for those product-owned node renderers. It owns the complete selected ring, shared surface material, content padding, and neutral connection-handle geometry. Products pass only `content` and optional `handles` slots, then keep role, status, validation, and execution semantics in their own node data. Do not add status dots, filled health decoration, or left-edge selection markers to the shared surface.

The package also owns a finite two-skin visual tone palette:
`--color-workflow-tone-{amber,green,cyan,orange,purple,blue,red,teal,indigo,pink}`.
Products map their domain categories to these abstract tones in product CSS;
domain names such as “flight” or “recording” do not become shared tokens.
Execution emphasis reuses the global semantic `--color-accent`,
`--color-success`, `--color-warning`, or `--color-danger` roles. A product must
not copy palette values into its skin or retain parallel
`--color-automation-*` aliases. Tones belong on small content such as an icon
or edge; they never tint the complete node surface as a status block, and text
must carry execution meaning.

```tsx
<WorkflowNodeSurface
  content={<NodeContent node={node} />}
  handles={<><Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} /></>}
  selected={selected}
/>
```

```tsx
<WorkflowCanvas
  editable
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  empty="Add a node to begin"
/>
```

Import `@xgc2/ui-workflow/styles.css` once at the application boundary. The stylesheet includes the required React Flow base CSS.

Toolbar dimensions, handle geometry, and handle hit targets use the shared
semantic geometry contract. Spacing rhythm tokens are reserved for layout and
cannot be repurposed as node or control dimensions.

Use `WorkflowNodeToolbar` for node actions and `WorkflowElementToolbar` inside an edge toolbar. Both consume the same action model and own event isolation, compact shared buttons, focus semantics, and visual treatment. Product code supplies only the business callbacks and labels.
