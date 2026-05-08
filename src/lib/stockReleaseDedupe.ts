import { StockRelease } from '@/types/inventory';

const normalizeText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
};

const normalizeNumber = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const normalizeAllocationKey = (allocation?: string | null) => {
  return normalizeText(allocation).replace(/[^a-z0-9]/gi, '');
};

export const getStockReleaseGroupKey = (release: StockRelease) => {
  const allocationKey = normalizeAllocationKey(release.allocation_bill);
  if (allocationKey) return `allocation:${allocationKey}`;

  const batchId = normalizeText(release.batch_id);
  if (batchId) return `batch:${batchId}`;

  return `release:${normalizeText(release.id)}`;
};

export const getStockReleaseDisplayKey = (release: StockRelease) => [
  normalizeAllocationKey(release.allocation_bill),
  normalizeText(release.item_id),
  normalizeText(release.product_code),
  normalizeText(release.product_description),
  normalizeText(release.inventory_item?.item_code),
  normalizeText(release.inventory_item?.description || release.inventory_item?.item_name),
  normalizeText(release.destination),
  normalizeText(release.branch_id),
  normalizeText(release.category),
  normalizeText(release.courier),
  normalizeText(release.waybill_no),
  normalizeText(release.set_date),
  normalizeText(release.notes),
  normalizeNumber(release.boxes_released),
  normalizeNumber(release.total_qty),
  normalizeNumber(release.amount),
  normalizeNumber(release.unit_price),
].join('|');

export const dedupeStockReleasesForDisplay = (releases: StockRelease[]) => {
  const seen = new Set<string>();

  return releases.filter((release) => {
    const key = getStockReleaseDisplayKey(release);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
