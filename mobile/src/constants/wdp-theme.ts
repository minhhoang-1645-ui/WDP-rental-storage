export const WdpColors = {
  brand: '#CEDEF6',
  navy: '#345786',
  navyStrong: '#25436C',
  teal: '#345786',
  tealPressed: '#25436C',
  tealSubtle: '#CEDEF6',
  amber: '#466FA5',
  // Kept as a compatibility alias while existing screens migrate to the token name.
  orange: '#466FA5',
  background: '#F2F6FD',
  surface: '#FFFFFF',
  surfaceSecondary: '#E5EEFC',
  border: '#CEDEF6',
  disabled: '#ACBDD5',
  text: '#243957',
  muted: '#566B88',
  soft: '#E5EEFC',
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
