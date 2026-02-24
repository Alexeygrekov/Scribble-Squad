import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src2/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
} satisfies Config;
