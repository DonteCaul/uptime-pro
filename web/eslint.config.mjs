import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

/**
 * Flat ESLint config (ESLint 9).
 * - Next.js core-web-vitals + typescript flat configs
 * - TypeScript recommended rules
 * - Prettier compatibility (disables conflicting formatting rules)
 */
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
  // eslint-config-next ships flat config arrays at these subpaths.
  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
  ...(Array.isArray(nextTypescript) ? nextTypescript : [nextTypescript]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
  {
    rules: {
      // Allow server-only `any` in raw-SQL-heavy spots during migration; tighten later.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettierConfig,
);
