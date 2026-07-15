import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "Domain modules must remain independent of React." },
          { name: "@prisma/client", message: "Domain modules must remain independent of persistence." },
        ],
        patterns: [{
          group: ["next/**", "@/app/**", "@/components/**", "@/lib/**"],
          message: "Domain modules may depend only on other domain modules and shared value types.",
        }],
      }],
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
