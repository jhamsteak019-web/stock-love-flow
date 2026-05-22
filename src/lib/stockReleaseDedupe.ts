import { StockRelease } from '@/types/inventory';

const normalizeText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
};

const normalizeNumber = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const hasUsefulStockReleaseText = (value?: string | null) => {
  const cleaned = value?.trim();
  if (!cleaned) return false;
  const normalized = cleaned.toLowerCase();
  return normalized !== '-' && normalized !== 'n/a' && normalized !== 'na' && normalized !== 'null';
};

export const hasStockReleaseProductDetails = (release: StockRelease) => {
  return [
    release.product_code,
    release.product_description,
    release.inventory_item?.item_code,
    release.inventory_item?.item_name,
    release.inventory_item?.description,
  ].some(hasUsefulStockReleaseText);
};

export const isImportedStockReleaseProductRow = (release: StockRelease) => {
  return hasUsefulStockReleaseText(release.product_code) ||
    hasUsefulStockReleaseText(release.product_description) ||
    (release.unit_price !== null && release.unit_price !== undefined);
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

export const getStockReleaseDisplayKey = (release: StockRelease) => {
  if (isImportedStockReleaseProductRow(release)) {
    return `imported-product:${normalizeText(release.id)}`;
  }

  const baseKey = [
    normalizeAllocationKey(release.allocation_bill),
    normalizeText(release.destination),
    normalizeText(release.branch_id),
    normalizeText(release.category),
    normalizeText(release.courier),
    normalizeText(release.waybill_no),
    normalizeText(release.notes),
  ];

  if (hasStockReleaseProductDetails(release)) {
    return [
      'product',
      ...baseKey,
      normalizeText(release.item_id),
      normalizeText(release.product_code || release.inventory_item?.item_code),
      normalizeText(release.product_description || release.inventory_item?.description || release.inventory_item?.item_name),
      normalizeNumber(release.unit_price ?? release.inventory_item?.price),
    ].join('|');
  }

  return [
    'summary',
    ...baseKey,
  ].join('|');
};

const getPreferredRelease = (current: StockRelease, next: StockRelease) => {
  const currentTime = Date.parse(current.created_at || current.updated_at || '') || 0;
  const nextTime = Date.parse(next.created_at || next.updated_at || '') || 0;

  if (nextTime > currentTime) return next;
  if (nextTime < currentTime) return current;

  const currentBoxes = normalizeNumber(current.boxes_released);
  const nextBoxes = normalizeNumber(next.boxes_released);
  if (nextBoxes > currentBoxes) return next;

  return current;
};

export const dedupeStockReleasesForDisplay = (releases: StockRelease[]) => {
  const byKey = new Map<string, StockRelease>();
  const keyOrder: string[] = [];

  releases.forEach((release) => {
    const key = getStockReleaseDisplayKey(release);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, release);
      keyOrder.push(key);
      return;
    }

    byKey.set(key, getPreferredRelease(existing, release));
  });

  return keyOrder
    .map(key => byKey.get(key))
    .filter((release): release is StockRelease => Boolean(release));
};

export const getStockReleaseCountingReleases = (releaseItems: StockRelease[]) => {
  const detailedItems = releaseItems.filter(hasStockReleaseProductDetails);
  return dedupeStockReleasesForDisplay(detailedItems.length > 0 ? detailedItems : releaseItems);
};

export const getStockReleaseBoxTotal = (releaseItems: StockRelease[]) => {
  const manualBoxRows = releaseItems.filter(release => !isImportedStockReleaseProductRow(release));
  const boxRows = manualBoxRows.length > 0 ? manualBoxRows : releaseItems;
  const boxesByKey = new Map<string, number>();

  boxRows.forEach((release) => {
    const key = getStockReleaseDisplayKey(release);
    boxesByKey.set(key, Math.max(boxesByKey.get(key) ?? 0, normalizeNumber(release.boxes_released)));
  });

  const totalBoxes = Array.from(boxesByKey.values()).reduce((sum, boxes) => sum + boxes, 0);
  const hasQtyOrProductLines = releaseItems.some(release => {
    return normalizeNumber(release.total_qty) > 0 || hasStockReleaseProductDetails(release);
  });

  return totalBoxes > 0 || !hasQtyOrProductLines ? totalBoxes : 1;
};

export const getStockReleaseQty = (release: StockRelease) => {
  const totalQty = normalizeNumber(release.total_qty);
  return totalQty > 0 ? totalQty : normalizeNumber(release.boxes_released);
};

export const getStockReleaseUnitPrice = (release: StockRelease) => {
  const directPrice = normalizeNumber(release.unit_price ?? release.inventory_item?.price);
  if (directPrice > 0) return directPrice;

  const storedAmount = normalizeNumber(release.amount);
  const qty = getStockReleaseQty(release);
  return storedAmount > 0 && qty > 0 ? storedAmount / qty : 0;
};

export const getStockReleaseAmount = (release: StockRelease) => {
  const storedAmount = normalizeNumber(release.amount);
  if (storedAmount > 0) {
    return storedAmount;
  }

  const price = getStockReleaseUnitPrice(release);
  if (price > 0) return price * getStockReleaseQty(release);
  return storedAmount;
};
