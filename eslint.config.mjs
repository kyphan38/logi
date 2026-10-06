import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // functions/ has its own tsconfig and deploy cycle, linted there with tsc.
    "functions/**",
    // The service worker runs outside the bundle, no TypeScript or JSX.
    "public/sw.js",
  ]),
]);

export default eslintConfig;
