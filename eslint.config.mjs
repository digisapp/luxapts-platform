import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The microsite generator and its _shared Stacy helpers are plain CommonJS
  // Node scripts, not app code: they run via `node microsites/_generator/build.js`,
  // never bundled or imported by Next. Linting its require() calls as if it were an ES module failed CI on
  // every push — and because Lint runs before Unit tests, the whole suite was
  // skipped, so nothing was actually being verified.
  {
    files: ["microsites/_generator/*.js", "microsites/_shared/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
