export const brandColors = {
  primary: "#0C2454",
  secondary: "#BC2C24",
  white: "#FFFFFF",
} as const;

export const colorTokens = {
  brand: brandColors,
  light: {
    canvas: "#F6F8FC",
    surface: "#FFFFFF",
    surfaceMuted: "#EDF1F8",
    text: "#0C2454",
    textMuted: "#647188",
    border: "#DCE3EE",
    primary: brandColors.primary,
    secondary: brandColors.secondary,
    focus: brandColors.secondary,
  },
  dark: {
    canvas: "#07142E",
    surface: "#0C2454",
    surfaceMuted: "#132F62",
    text: "#F7F9FC",
    textMuted: "#B8C4D7",
    border: "#294675",
    primary: "#DCE5F3",
    secondary: "#E56760",
    focus: "#E56760",
  },
  status: {
    success: "#16835B",
    warning: "#B87400",
    danger: brandColors.secondary,
    info: "#315F9E",
  },
} as const;

export const typographyTokens = {
  fontFamily: {
    display: '"Manrope", ui-sans-serif, system-ui, sans-serif',
    body: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    displaySm: "2rem",
    displayMd: "clamp(2.5rem, 5vw, 4rem)",
    displayLg: "clamp(3rem, 6vw, 4.75rem)",
  },
  lineHeight: { tight: 1.05, heading: 1.2, body: 1.65 },
  letterSpacing: { tight: "-0.03em", normal: "0", wide: "0.12em" },
} as const;

export const spacingTokens = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

export const radiusTokens = {
  none: "0",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  full: "9999px",
} as const;

export const shadowTokens = {
  sm: "0 4px 12px rgb(12 36 84 / 0.08)",
  md: "0 12px 34px rgb(12 36 84 / 0.12)",
  lg: "0 24px 60px rgb(12 36 84 / 0.16)",
  focus: "0 0 0 3px rgb(188 44 36 / 0.24)",
} as const;

export const motionTokens = {
  duration: { instant: "80ms", fast: "160ms", normal: "240ms", slow: "400ms" },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

export const iconTokens = {
  size: { xs: "0.875rem", sm: "1rem", md: "1.25rem", lg: "1.5rem", xl: "2rem" },
  strokeWidth: { regular: 1.75, strong: 2.25 },
  containerRadius: radiusTokens.md,
} as const;

export const theme = {
  colors: colorTokens,
  typography: typographyTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  shadows: shadowTokens,
  motion: motionTokens,
  icons: iconTokens,
} as const;

export type Theme = typeof theme;
export type ThemeMode = "light" | "dark" | "system";
