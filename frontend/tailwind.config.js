import defaultTheme from "tailwindcss/defaultTheme";

const withOpacity = (cssVariable) => `rgb(var(${cssVariable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: withOpacity("--color-primary"),
        accent: withOpacity("--color-accent"),
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          soft: withOpacity("--color-surface-soft"),
          strong: withOpacity("--color-surface-strong"),
        },
        muted: withOpacity("--color-muted"),
        background: withOpacity("--color-background"),
        foreground: withOpacity("--color-foreground"),
        border: withOpacity("--color-border"),
        // Backward-compatible aliases for existing classes.
        slatebg: "rgb(var(--color-background) / 1)",
        card: "rgb(var(--color-surface) / 1)",
        text: "rgb(var(--color-foreground) / 1)",
      },
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        display: ["Space Grotesk", "Inter", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: "0 20px 40px rgba(2, 6, 23, 0.35)",
      },
    },
  },
  plugins: [],
};
