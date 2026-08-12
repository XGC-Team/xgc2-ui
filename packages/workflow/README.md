# @xgc2/ui-workflow

Reusable spatial editor foundation for workflow, topology, orchestration, and other node/edge frontends.

The package owns the canvas viewport, React Flow interaction defaults, grid, selection surface, drag/drop coordinate conversion, empty overlay, canvas and element toolbars, and editable sticky notes. A product supplies its node and edge renderers, domain schemas, validation, execution state, persistence, and API operations.

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

Use `WorkflowNodeToolbar` for node actions and `WorkflowElementToolbar` inside an edge toolbar. Both consume the same action model and own event isolation, compact shared buttons, focus semantics, and visual treatment. Product code supplies only the business callbacks and labels.
