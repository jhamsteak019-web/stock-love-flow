import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { StockRelease } from "@/types/inventory";

type Params = {
  month: number; // 0-indexed
  year: number;
  branchId?: string | null;
  allYear?: boolean;
};

const PAGE_SIZE = 1000;
const STOCK_RELEASE_PERIOD_SELECT =
  "id,item_id,boxes_released,destination,courier,allocation_bill,released_by,delivery_status,date_released,date_delivered,deleted_at,notes,batch_id,category,waybill_no,set_date,total_qty,amount,photo_url,photo_status,branch_id,created_at,updated_at,product_code,product_description,unit_price,inventory_item:inventory_items(*)";

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
export const useStockReleasesForPeriod = ({ month, year, branchId, allYear = false }: Params) => {
  const [releases, setReleases] = useState<StockRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const silentRefreshRef = useRef(false);
  const releaseCountRef = useRef(0);
  const { toast } = useToast();

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

      const buildQuery = (from: number, to: number, withCount = false) => {
        let query = supabase
          .from("stock_releases")
          .select(STOCK_RELEASE_PERIOD_SELECT, withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null)
          .or(periodOrFilter)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (branchId) {
          query = query.eq("branch_id", branchId);
        }

        return query;
      };

      const { data: firstPage, error, count } = await buildQuery(0, PAGE_SIZE - 1, true);
      if (error) throw error;

      const all = [...((firstPage ?? []) as StockRelease[])];
      const totalCount = count ?? all.length;

      if (totalCount > PAGE_SIZE) {
        const pageRequests = [];
        for (let from = PAGE_SIZE; from < totalCount; from += PAGE_SIZE) {
          pageRequests.push(buildQuery(from, from + PAGE_SIZE - 1));
        }

        const pages = await Promise.all(pageRequests);
        pages.forEach(({ data, error: pageError }) => {
          if (pageError) throw pageError;
          all.push(...((data ?? []) as StockRelease[]));
        });
      }

      if (!cancelled) {
        releaseCountRef.current = all.length;
        setReleases(all);
      }
    };

    run()
      .catch((error) => {
        console.error("Error fetching stock releases for period:", error);
        if (!cancelled) {
          releaseCountRef.current = 0;
          setReleases([]);
          toast({
            title: "Error",
            description: "Failed to load complete monthly data",
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
  }, [month, year, branchId, allYear, toast, refreshTick]);

  return { releases, loading };
};
