import { globalIgnores } from "eslint/config";
import typescriptEslint from "typescript-eslint";

const config = [
  ...typescriptEslint.configs.recommended,
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
];

export default config;
