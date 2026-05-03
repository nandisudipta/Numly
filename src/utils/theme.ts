export const THEMES = ['void', 'aura', 'life', 'work', 'impact'] as const;

/** Returns a hex color for index-based card coloring in Books/Ledgers */
export const CARD_COLORS = [
  '#28C7D0', // cyan
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#EC4899', // pink
  '#3B82F6', // blue
  '#D9E34B', // gold
  '#14B8A6', // teal
];

export const getNeonTheme = (_id: string, _index: number): string => {
  return '';
};

/** Get a vivid accent hex color for a card at the given index */
export const getCardColor = (index: number): string => {
  return CARD_COLORS[index % CARD_COLORS.length];
};
