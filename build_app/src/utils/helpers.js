export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const sameIdList = (a = [], b = []) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
};

export const hexToRgba = (hex, alpha = 1) => {
    if (typeof hex !== 'string') return `rgba(239, 68, 68, ${alpha})`;
    let sanitized = hex.trim().replace(/^#/, '');
    if (sanitized.length === 3) {
        sanitized = sanitized.split('').map(char => char + char).join('');
    }
    if (sanitized.length !== 6) return `rgba(239, 68, 68, ${alpha})`;
    const r = parseInt(sanitized.slice(0, 2), 16);
    const g = parseInt(sanitized.slice(2, 4), 16);
    const b = parseInt(sanitized.slice(4, 6), 16);
    const clampedAlpha = Math.max(0, Math.min(1, alpha ?? 1));
    return `rgba(${Number.isFinite(r) ? r : 239}, ${Number.isFinite(g) ? g : 68}, ${Number.isFinite(b) ? b : 68}, ${clampedAlpha})`;
};

export const getContrastingHex = (hex) => {
    if (typeof hex !== 'string') return '#ffffff';
    let sanitized = hex.trim().replace(/^#/, '');
    if (sanitized.length === 3) {
        sanitized = sanitized.split('').map(char => char + char).join('');
    }
    if (sanitized.length !== 6) return '#ffffff';
    const r = parseInt(sanitized.slice(0, 2), 16) || 0;
    const g = parseInt(sanitized.slice(2, 4), 16) || 0;
    const b = parseInt(sanitized.slice(4, 6), 16) || 0;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 140 ? '#0f172a' : '#ffffff';
};

export const applyAlphaToColor = (baseColor, alpha = 1) => {
    if (typeof baseColor !== 'string') return 'rgba(239, 68, 68, 1)';
    const trimmed = baseColor.trim();
    if (trimmed.startsWith('#')) {
        return hexToRgba(trimmed, alpha);
    }
    return trimmed;
};
