import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Client-side pagination for a list. Resets to page 1 when the list changes.
export function usePager<T>(items: T[], size = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  useEffect(() => { setPage(1); }, [items.length]);
  const current = Math.min(page, pages);
  const rows = items.slice((current - 1) * size, current * size);
  return { rows, page: current, pages, total: items.length, setPage, size };
}

type PagerState = ReturnType<typeof usePager<unknown>>;

export function Pager({ p }: { p: PagerState }) {
  if (p.total <= p.size) return null;
  const from = (p.page - 1) * p.size + 1;
  const to = Math.min(p.total, p.page * p.size);
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Showing {from}–{to} of {p.total}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)}>Previous</Button>
        <span className="px-2 tabular-nums">{p.page} / {p.pages}</span>
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)}>Next</Button>
      </div>
    </div>
  );
}
