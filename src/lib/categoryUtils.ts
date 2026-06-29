const KNOWN_CATEGORY_CODES = ['MHB', 'MLP', 'MSH', 'MUM', 'CE', 'CL', 'LX', 'CX', 'XD', 'XP'];

export const extractCategoryFromText = (value?: string | null) => {
  const normalized = String(value || '').toUpperCase();
  if (!normalized.trim()) return '';

  for (const code of KNOWN_CATEGORY_CODES) {
    const pattern = new RegExp(`(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`, 'i');
    if (pattern.test(normalized)) return code;
  }

  return '';
};

export const resolveCategory = (
  category?: string | null,
  ...fallbackTexts: Array<string | null | undefined>
) => {
  const explicitCategory = String(category || '').trim();
  if (explicitCategory) return explicitCategory.toUpperCase();

  for (const text of fallbackTexts) {
    const detected = extractCategoryFromText(text);
    if (detected) return detected;
  }

  return '';
};
