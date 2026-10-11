import next from "eslint-config-next";
import prettier from "eslint-config-prettier";

const config = [
  { ignores: [".next/**", "dist/**", "docs/**", "next-env.d.ts"] },
  ...next,
  prettier,
];

export default config;
