export const normalizeAllocationBill = (allocation?: string | null) =>
  String(allocation || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
