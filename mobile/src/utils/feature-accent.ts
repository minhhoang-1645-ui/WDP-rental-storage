import { WdpColors } from '@/constants/wdp-theme';

/** Color identifies a service category; business status uses separate semantic tokens. */
export function featureAccent(path: string) {
  if (/invoice|payment|finance|deposit/.test(path)) return WdpColors.accentPurple;
  if (/support|inquir|maintenance/.test(path)) return WdpColors.orange;
  if (/stock|transfer|return/.test(path)) return WdpColors.success;
  return WdpColors.navy;
}
