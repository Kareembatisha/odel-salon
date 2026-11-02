// Single import point for the build-time brand identity.
// `@brand/*` resolves to src/brands/odel/* — a different flavor swaps the
// underlying file via angular.json `fileReplacements` (see README → Brand flavors).
export { BRAND, type BrandConfig } from '@brand/brand';
