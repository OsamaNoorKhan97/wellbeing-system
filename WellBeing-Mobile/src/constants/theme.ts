/** WellBeing mobile design tokens. The web app's teal brand carries over; spacing and sizes are tuned for touch. */
export const colors = {
  primary: '#0F766E',
  primaryDark: '#0B5A54',
  primarySoft: '#E6F4F2',
  accent: '#F59E0B',
  bg: '#F4F7F7',
  card: '#FFFFFF',
  text: '#0F1F1E',
  textMuted: '#5B6B6A',
  border: '#DDE5E4',
  danger: '#DC2626',
  dangerSoft: '#FEE9E9',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  success: '#15803D',
  successSoft: '#DCFCE7',
  info: '#1D4ED8',
  infoSoft: '#E0EAFF',
  neutralSoft: '#EDF1F1',
  overlay: 'rgba(15,31,30,0.5)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 };
/** Minimum comfortable touch target (Material 48dp / Apple 44pt). */
export const TOUCH = 48;

export const shadow = {
  shadowColor: '#0F1F1E',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};
