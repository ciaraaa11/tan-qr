import { COLORS } from "./colors";

export const THEME = {
  colors: COLORS,

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },

  fontSize: {
    caption: 11,
    small: 13,
    body: 15,
    subtitle: 18,
    title: 24,
    heading: 30,
  },

  shadow: {
    shadowColor: COLORS.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;
