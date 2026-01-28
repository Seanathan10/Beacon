declare module '@jest/globals' {
  // Minimal typing shim for this repo's ts-jest ESM setup.
  // Jest runtime provides this module, but the TypeScript resolver may not.
  export const jest: any;
}
