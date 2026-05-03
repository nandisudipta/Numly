// Shared color and icon configuration for businesses, books, and ledgers

export const COLOR_OPTIONS = [
  { id: 'gold', label: 'Gold', hex: '#D9E34B', rgb: '217, 227, 75' },
  { id: 'cyan', label: 'Cyan', hex: '#28C7D0', rgb: '40, 199, 208' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981', rgb: '16, 185, 129' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6', rgb: '139, 92, 246' },
  { id: 'orange', label: 'Orange', hex: '#F59E0B', rgb: '245, 158, 11' },
  { id: 'red', label: 'Red', hex: '#EF4444', rgb: '239, 68, 68' },
  { id: 'blue', label: 'Blue', hex: '#3B82F6', rgb: '59, 130, 246' },
  { id: 'pink', label: 'Pink', hex: '#EC4899', rgb: '236, 72, 153' },
  { id: 'indigo', label: 'Indigo', hex: '#6366F1', rgb: '99, 102, 241' },
  { id: 'teal', label: 'Teal', hex: '#14B8A6', rgb: '20, 184, 166' },
];

export const BOOK_ICONS = [
  { id: 'book', emoji: '📒', label: 'Notebook' },
  { id: 'cash', emoji: '💰', label: 'Cash' },
  { id: 'bank', emoji: '🏦', label: 'Bank' },
  { id: 'chart', emoji: '📊', label: 'Chart' },
  { id: 'shop', emoji: '🏪', label: 'Shop' },
  { id: 'cart', emoji: '🛒', label: 'Cart' },
  { id: 'wallet', emoji: '👛', label: 'Wallet' },
  { id: 'gem', emoji: '💎', label: 'Gold/Gem' },
  { id: 'receipt', emoji: '🧾', label: 'Receipt' },
  { id: 'folder', emoji: '📁', label: 'Folder' },
  { id: 'coins', emoji: '🪙', label: 'Coins' },
  { id: 'briefcase', emoji: '💼', label: 'Briefcase' },
  { id: 'farm', emoji: '🌾', label: 'Farm' },
  { id: 'truck', emoji: '🚛', label: 'Truck' },
  { id: 'home', emoji: '🏠', label: 'Property' },
  { id: 'star', emoji: '⭐', label: 'Star' },
  { id: 'stock', emoji: '📈', label: 'Stock' },
  { id: 'tool', emoji: '🔧', label: 'Workshop' },
];

export const BUSINESS_LOGOS = [
  '🏢', '🏪', '🏦', '🏭', '🏗️', '🛒', '💼', '🍽️',
  '🔧', '🌿', '💻', '🚀', '🎨', '📐', '🚢', '🎵',
  '👔', '🎓', '⚕️', '✈️',
];

export function getColorConfig(color?: string | null) {
  // Try to find by ID first
  let config = COLOR_OPTIONS.find(c => c.id === color);
  
  if (!config) {
    // If not found by ID, maybe it's a hex already?
    const isHex = color?.startsWith('#');
    if (isHex && color) {
      config = { 
        id: 'custom', 
        label: 'Custom', 
        hex: color, 
        rgb: hexToRgb(color) || '40, 199, 208' // fallback to cyan rgb if parse fails
      };
    } else {
      config = COLOR_OPTIONS[0]; // Gold/Lime default
    }
  }

  return {
    ...config,
    glow: `rgba(${config.rgb}, 0.25)`,
    border: `rgba(${config.rgb}, 0.35)`,
    bg: `rgba(${config.rgb}, 0.1)`,
  };
}

// Helper to convert hex to rgb string
function hexToRgb(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    null;
}

export function getColorHex(color?: string | null): string {
  if (color?.startsWith('#')) return color;
  return COLOR_OPTIONS.find(c => c.id === color)?.hex ?? '#D9E34B';
}

export function getBookEmoji(iconId?: string | null): string {
  return BOOK_ICONS.find(i => i.id === iconId)?.emoji ?? '📒';
}

export function bannerStyle(colorId?: string | null): React.CSSProperties {
  const config = getColorConfig(colorId);
  return {
    background: `linear-gradient(135deg, ${config.bg}, transparent)`,
    borderBottom: `1px solid ${config.border}`,
  };
}

export function iconBorderStyle(colorId?: string | null): React.CSSProperties {
  const config = getColorConfig(colorId);
  return { 
    borderColor: config.border,
    boxShadow: `0 8px 32px -4px ${config.glow}`
  };
}

export function listAccentStyle(colorId?: string | null): React.CSSProperties {
  const config = getColorConfig(colorId);
  return { borderLeft: `4px solid ${config.hex}` };
}
