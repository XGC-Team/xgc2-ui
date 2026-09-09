Mark Prompt reuses xgc2/web/src/devtools/mark-prompt and its Vite Herdr bridge.

The toolbar structure, drag/selection behavior, target menu, copy/send/land actions and marker stylesheet are restored from xgc2. ControlButton, SelectControl and controlFoundation are copied unchanged from xgc2; their implementation uses the retained @xgc2/ui-react 0.16.10 artifact in vendor/.

Local adaptations are import paths, Chinese/English labels, isolated research.markPrompt storage and local transport. scripts/prepare-marker-styles.mjs scopes the original family stylesheet and tokens to the marker and its portaled target menu, mapping the workbench theme without replacing Atlas global styles. Run it after updating the retained family artifact.

Validation: npm run build; node scripts/check-marker-prompt.mjs. The browser check exercises selection, dragging, copy and persistence without sending Herdr commands. Send and land retain the original bridge contract and run only on explicit user interaction.
