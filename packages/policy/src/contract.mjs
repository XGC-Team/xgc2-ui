// The repository and the published CLI intentionally share one contract.
// The build copies the implementation into dist so consumers never depend on
// this workspace layout.
export * from '../../../scripts/style-policy-contract.mjs';
