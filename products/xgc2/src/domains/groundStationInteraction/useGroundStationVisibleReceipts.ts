import { useEffect,type RefObject } from 'react';
import { markGroundStationRead } from './groundStationAttention';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

/** A parked panel, a background tab, or an item below the fold is not a read receipt. */
export function useGroundStationVisibleReceipts(
  ref: RefObject<HTMLElement | null>, items: readonly GroundStationInteraction[], visible: boolean, targetId: string,
) {
  useEffect(() => {
    const root = ref.current;
    if (!visible || !root || typeof IntersectionObserver === 'undefined') return;
    const byId = new Map(items.map((item) => [item.id,item]));
    let observer: IntersectionObserver | undefined;
    let active = true;
    const observe = () => {
      observer?.disconnect();
      if (document.visibilityState !== 'visible') return;
      observer = new IntersectionObserver((entries) => {
        if (!active || document.visibilityState !== 'visible') return;
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || !root.contains(entry.target)) return;
          const item = byId.get(entry.target.getAttribute('data-xgc-id') ?? '');
          if (item) markGroundStationRead(item, targetId);
        });
      // The viewport root also clips through the feed's scrolling ancestors.
      // A feed root alone reports 100% for entries in an entirely offscreen panel.
      }, { root: null,threshold: 0.5 });
      root.querySelectorAll('[data-xgc-role="ground-station-chat-decision-entry"], [data-xgc-role="ground-station-interaction-status-card"], [data-xgc-role="ground-station-interaction-context-offer"]')
        .forEach((entry) => observer?.observe(entry));
    };
    observe();
    // Virtualized rows mount as the operator scrolls; mounting still is not reading.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => [...record.addedNodes,...record.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE))) observe();
    });
    mutations.observe(root, { childList: true,subtree: true });
    document.addEventListener('visibilitychange', observe);
    return () => { active = false; mutations.disconnect(); observer?.disconnect(); document.removeEventListener('visibilitychange', observe); };
  }, [items,ref,visible,targetId]);
}
