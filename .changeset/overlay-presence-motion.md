---
"@xgc2/ui-react": patch
"@xgc2/ui-policy": patch
---

Animate overlay presence in Drawer, Modal, Popover, and SelectMenu. Enter runs once on mount; a closing surface stays mounted through its exit animation via the new shared `usePresence` hook, which waits for the surface's running animations and always releases the node through a leak-guard timer. Overlay stack registration, focus restore, and trigger aria still observe the close immediately. Reduced-motion operators and environments without matchMedia keep the historical instant mount/unmount path. Durations, easings, travel distances, and opacity endpoints are shared tokens only. Pair policy with the React patch.
