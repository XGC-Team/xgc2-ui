import { useId } from 'react';

type BrandMarkProps = {
  className?: string;
};

/** Rounded X with a designed plus-shaped origin cut. */
export function BrandMark({ className }: BrandMarkProps) {
  const maskId = `xgc-brand-origin-${useId()}`;
  return (
    <svg className={className} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="#fff" />
          <rect x="10.9" y="7.75" width="2.2" height="8.5" rx="0.55" fill="#000" />
          <rect x="7.75" y="10.9" width="8.5" height="2.2" rx="0.55" fill="#000" />
        </mask>
      </defs>
      <g fill="currentColor" mask={`url(#${maskId})`} transform="rotate(45 12 12)">
        <rect x="10.15" y="2.8" width="3.7" height="18.4" rx="1.85" />
        <rect x="2.8" y="10.15" width="18.4" height="3.7" rx="1.85" />
      </g>
    </svg>
  );
}
