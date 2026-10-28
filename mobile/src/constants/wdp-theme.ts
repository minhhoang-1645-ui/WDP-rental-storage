export const WdpColors = {
  navy: '#17324D',
  navyStrong: '#122A40',
  teal: '#187D78',
  tealPressed: '#12645F',
  tealSubtle: '#E8F3F0',
  amber: '#D49A52',
  // Kept as a compatibility alias while existing screens migrate to the token name.
  orange: '#D49A52',
  background: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F3F1',
  border: '#E5EAE8',
  disabled: '#B8C1C2',
  text: '#162733',
  muted: '#687781',
  soft: '#EDF3F1',
  warm: '#FFF3DB',
  success: '#237A57',
  successBackground: '#E7F4EC',
  warning: '#A86D24',
  warningBackground: '#FFF3DB',
  danger: '#BD4545',
  dangerBackground: '#FBECEC',
  information: '#306A9C',
} as const;

export const WdpSpacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;

export const WdpRadius = { sm: 10, md: 12, lg: 16, full: 9999 } as const;

export const WdpType = {
  screenTitle: { fontSize: 29, lineHeight: 37, fontWeight: '700' as const },
  sectionTitle: { fontSize: 21, lineHeight: 28, fontWeight: '700' as const },
  cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
  secondary: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },
} as const;
