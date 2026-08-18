export const theme = {
  colors: {
    primary: "#3b82f6",
    secondary: "#8b5cf6",
    accent: "#06b6d4",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#f8fafc",
    muted: "#94a3b8",
  },
  fonts: {
    heading: "Gotham",
    body: "Gotham",
  },
  sizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.5rem",
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
  },
} as const;

export type RuiTheme = typeof theme;
export type RuiColor = keyof typeof theme.colors;
export type RuiSize = keyof typeof theme.sizes;
export type RuiRadius = keyof typeof theme.radius;
