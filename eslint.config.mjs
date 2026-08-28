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
    // functions/ có tsconfig và vòng đời deploy riêng - lint ở đó bằng tsc.
    "functions/**",
    // Service worker chạy ngoài bundle, không có TypeScript hay JSX.
    "public/sw.js",
  ]),
]);

export default eslintConfig;
