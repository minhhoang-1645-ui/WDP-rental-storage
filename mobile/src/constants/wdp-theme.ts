export const WdpColors = {
  brand: '#175CD3',
  navy: '#175CD3',
  navyStrong: '#123E85',
  teal: '#175CD3',
  tealPressed: '#124AA8',
  tealSubtle: '#EAF1FF',
  amber: '#A85C00',
  // Kept as a compatibility alias while existing screens migrate to the token name.
  orange: '#B54708',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F2F4F7',
  border: '#D0D5DD',
  disabled: '#98A2B3',
  text: '#17191D',
  muted: '#475467',
  soft: '#F2F4F7',
  warm: '#FFF0C2',
  mint: '#D4F2DF',
  lavender: '#E8DDFF',
  peach: '#FFE0C7',
  accentPurple: '#6941C6',
  success: '#087443',
  successBackground: '#D4F2DF',
  warning: '#8A4B00',
  warningBackground: '#FFF0C2',
  danger: '#B42318',
  dangerBackground: '#FFE0DC',
  information: '#175CD3',
} as const;

export const WdpSpacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;

/** Customer-only palette; operational role tokens above remain unchanged. */
export const CustomerTheme = {
  ...WdpColors,
  cobalt: '#1859E8',
  deepNavy: '#102650',
  onHero: '#FFFFFF',
  onHeroSecondary: '#DCE8FF',
  heroControl: 'rgba(255,255,255,0.14)',
  divider: '#EAECF0',
  pagePadding: 20,
  radius: 16,
} as const;

export const WdpRadius = { sm: 10, md: 12, lg: 16, full: 9999 } as const;

export const WdpType = {
  screenTitle: { fontSize: 22, lineHeight: 30, fontWeight: '700' as const },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700' as const },
  cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  secondary: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
} as const;
