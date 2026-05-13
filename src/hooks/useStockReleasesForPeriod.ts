import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { DeliveryStatus, StockRelease } from "@/types/inventory";

type Params = {
  month: number; // 0-indexed
  year: number;
  branchId?: string | null;
  allYear?: boolean;
  allDates?: boolean;
  actionStatus?: "yes" | "no" | null;
  deliveryStatus?: DeliveryStatus | "all";
  excludeDelivered?: boolean;
  includePendingReview?: boolean;
  progressive?: boolean;
  enabled?: boolean;
};

const PAGE_SIZE = 1000;
const PAGE_BATCH_SIZE = 4;
const STOCK_RELEASE_PERIOD_SELECT =
  "id,item_id,boxes_released,destination,courier,allocation_bill,released_by,delivery_status,date_released,date_delivered,deleted_at,notes,batch_id,category,waybill_no,set_date,total_qty,amount,photo_url,photo_status,branch_id,created_at,updated_at,product_code,product_description,unit_price,inventory_item:inventory_items(id,item_code,item_name,description,price,pieces_per_box)";

const getUtcMonthRange = (month: number, year: number) => {
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)).toISOString();
  return { start, end };
};

const getUtcYearRange = (year: number) => {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString();
  return { start, end };
};

/**
 * Fetches ALL stock releases for a specific month/year + optional branch.
 *
 * IMPORTANT:
 * - We must paginate because PostgREST limits results (default 1,000).
 * - We mirror Dashboard logic: use set_date when present, otherwise date_released.
 */
export const useStockReleasesForPeriod = ({
  month,
  year,
  branchId,
  allYear = false,
  allDates = false,
  actionStatus,
  deliveryStatus = "all",
  excludeDelivered = false,
  includePendingReview = false,
  progressive = false,
  enabled = true,
}: Params) => {
  const [releases, setReleases] = useState<StockRelease[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [refreshTick, setRefreshTick] = useState(0);
  const silentRefreshRef = useRef(false);
  const releaseCountRef = useRef(0);
  const { toast } = useToast();

  const refetch = useCallback((silent = false) => {
    silentRefreshRef.current = silent;
    setRefreshTick(tick => tick + 1);
  }, []);

  useEffect(() => {
    const handleSoftRefresh = () => {
      silentRefreshRef.current = true;
      setRefreshTick(tick => tick + 1);
    };

    window.addEventListener('app:soft-refresh', handleSoftRefresh);
    return () => {
      window.removeEventListener('app:soft-refresh', handleSoftRefresh);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseCountRef.current = 0;
      setReleases([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const silentRefresh = silentRefreshRef.current && releaseCountRef.current > 0;
      silentRefreshRef.current = false;

      if (!silentRefresh) setLoading(true);
      const { start, end } = allYear
        ? getUtcYearRange(year)
        : getUtcMonthRange(month, year);

      // OR condition:
      // 1) set_date in range
      // 2) set_date is null AND date_released in range
      const periodOrFilter = `and(set_date.gte.${start},set_date.lt.${end}),and(set_date.is.null,date_released.gte.${start},date_released.lt.${end})`;

      const buildQuery = (
        from: number,
        to: number,
        options: { ignorePeriod?: boolean; pendingReviewOnly?: boolean } = {},
      ) => {
        let query = supabase
          .from("stock_releases")
          .select(STOCK_RELEASE_PERIOD_SELECT)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!allDates && !options.ignorePeriod) {
          query = query.or(periodOrFilter);
        }

        if (branchId) {
          query = query.eq("branch_id", branchId);
        }

        if (options.pendingReviewOnly) {
          query = query.is("action_status", null);
        } else if (actionStatus === null) {
          query = query.is("action_status", null);
        } else if (actionStatus) {
          query = query.eq("action_status", actionStatus);
        }

        if (deliveryStatus !== "all") {
          query = query.eq("delivery_status", deliveryStatus);
        } else if (excludeDelivered) {
          query = query.neq("delivery_status", "delivered");
        }

        return query;
      };

      const publishRows = (rows: StockRelease[]) => {
        if (cancelled) return;
        releaseCountRef.current = rows.length;
        setReleases([...rows]);
        if (progressive) setLoading(false);
      };

      const fetchPages = async (
        options: { ignorePeriod?: boolean; pendingReviewOnly?: boolean } = {},
        onBatch?: (rows: StockRelease[]) => void,
      ) => {
        const pageRows: StockRelease[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const pagesInBatch = progressive && from === 0 ? 1 : PAGE_BATCH_SIZE;
          const pageStarts = Array.from(
            { length: pagesInBatch },
            (_, index) => from + index * PAGE_SIZE
          );
          const pageRequests = pageStarts.map(pageStart => buildQuery(pageStart, pageStart + PAGE_SIZE - 1, options));
          const pages = await Promise.all(pageRequests);

          for (const { data, error: pageError } of pages) {
            if (pageError) throw pageError;
            const rows = (data ?? []) as StockRelease[];
            pageRows.push(...rows);

            if (rows.length < PAGE_SIZE) {
              hasMore = false;
              break;
            }
          }

          onBatch?.(pageRows);
          from += pagesInBatch * PAGE_SIZE;
        }

        return pageRows;
      };

      const all = await fetchPages({}, progressive ? publishRows : undefined);

      if (includePendingReview && !allDates && actionStatus === undefined) {
        const byId = new Map(all.map(release => [release.id, release]));
        const pendingReviewRows = await fetchPages(
          { ignorePeriod: true, pendingReviewOnly: true },
          progressive
            ? (rows) => {
                rows.forEach(release => byId.set(release.id, release));
                publishRows(Array.from(byId.values()));
              }
            : undefined,
        );
        pendingReviewRows.forEach(release => byId.set(release.id, release));
        all.splice(0, all.length, ...byId.values());
      }

      if (!cancelled) {
        publishRows(all);
      }
    };

    run()
      .catch((error) => {
        console.error("Error fetching stock releases for period:", error);
        if (!cancelled) {
          const hasPartialRows = progressive && releaseCountRef.current > 0;
          if (!hasPartialRows) {
            releaseCountRef.current = 0;
            setReleases([]);
          }
          toast({
            title: "Error",
            description: hasPartialRows
              ? "Some older records may still be loading. Please refresh if data looks incomplete."
              : "Failed to load complete monthly data",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, year, branchId, allYear, allDates, actionStatus, deliveryStatus, excludeDelivered, includePendingReview, progressive, enabled, toast, refreshTick]);

  return { releases, loading, refetch };
};
