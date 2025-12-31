// constants/colours.ts

// 1) BASE PALETTE – using your retro milk bar colours
export const palette = {
  mint: '#AEE8D8',        // pastel mint
  darkMint: '#2A8C76',    // darker mint for accents (you can tweak)
  shakeRed: '#FF5C5C',    // ShakeIt red / cherry
  cream: '#FFF7E5',       // creamy vanilla
  white: '#FFFFFF',
  almostBlack: '#2A2A2A', // soft off-black
  muted: '#6A6A6A',       // secondary text
  mutedLight: '#999999',
  brown: '#C28B6C',

  error: '#FF6B6B',
  warning: '#FFB347',
  success: '#3CB371',
};

// 2) SEMANTIC THEME – USE THIS IN .tsx FILES
export const theme = {
  app: {
    background: palette.cream,      // root app background
    screenBackground: palette.cream,
  },

  surface: {
    card: palette.white,            // cards, callouts
    cardAlt: palette.cream,         // alternative cards / panels
    sheet: palette.cream,           // bottom sheets, modals
    border: '#E5D6C8',              // creamy border tone
    overlay: 'rgba(0,0,0,0.45)',    // dim background for modals
  },

  text: {
    primary: palette.almostBlack,
    secondary: palette.muted,
    muted: palette.mutedLight,
    onBrand: palette.white,         // ✅ high-contrast text on brand buttons
    onDark: palette.white,
    onLight: palette.almostBlack,
  },

  brand: {
    primary: palette.darkMint,      // ✅ deeper mint = more contrast
    primarySoft: '#D6F2EA',
    accent: palette.shakeRed,       // red accent (logo, key CTAs)
    accentSoft: '#FFD3D3',
  },

  nav: {
    headerBackground: palette.cream,
    headerText: palette.almostBlack,
    headerIcon: palette.shakeRed,

    tabBackground: palette.almostBlack,
    tabActive: palette.cream,
    tabInactive: 'rgba(255,247,229,0.7)',
  },

  controls: {
    // Primary = red, big actions
    buttonPrimaryBg: palette.shakeRed,
    buttonPrimaryText: palette.cream,

    // Secondary = mint / cream
    buttonSecondaryBg: palette.darkMint,      // ✅ darker mint
    buttonSecondaryText: palette.cream,       // ✅ light text on darkMint
    buttonSecondaryBorder: palette.darkMint,

    chipBg: palette.cream,
    chipBorder: palette.mint,
    chipText: palette.almostBlack,

    inputBg: palette.white,
    inputBorder: palette.mint,
    inputPlaceholder: palette.muted,
  },

  status: {
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
  },

  walkthrough: {
    bubbleBg: palette.cream,
    bubbleText: palette.almostBlack,
    highlightBorder: palette.shakeRed,
  },
};

export type Theme = typeof theme;

// 3) BACKWARDS-COMPAT: old `colors.*` keys mapped onto the new theme.
// This keeps the app compiling while we migrate TSX files.
export const colors = {
  // Original palette-style keys
  mint: palette.mint,
  cream: palette.cream,
  cherry: palette.shakeRed,
  brown: palette.brown,
  black: palette.almostBlack,

  // Old "roles" mapped to new theme
  primary: theme.brand.primary,
  primaryDark: theme.text.primary,
  background: theme.app.background,

  textMain: theme.text.primary,
  textSubtle: theme.text.secondary,
  textMuted: theme.text.muted,

  favourite: theme.brand.accent, // red hearts
  danger: theme.status.error,

  card: theme.surface.card,
  border: theme.surface.border,
};

// Default export – you can choose to treat this as "Colors" if you like
const Colors = theme;
export default Colors;
