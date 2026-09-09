# Robot kind composition fixtures

Static injection seam for Robot asset kinds (built-in PX4/Scout/Mecanum + optional Unitree B2 leaf).

## Product-root assembly

```ts
// profiles/core-*.tsx (or product owner contribution)
import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
  RobotAssetKindCompositionProvider,
} from '../src/domains/robot/robotAssetPublic';
import { unitreeB2RobotAssetKindContribution } from '../src/domains/robot/kinds/unitree-b2';

export const robotAssetKindComposition = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
  unitreeB2RobotAssetKindContribution, // omit for B2-false product
);

// Wrap ProductWebEntry children:
// <RobotAssetKindCompositionProvider composition={robotAssetKindComposition}>
```

- `with-unitree-b2.ts` — B2-true graph includes the leaf module.
- `without-unitree-b2.ts` — B2-false graph keeps built-ins only; never imports the leaf.
