import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Check, ChevronLeft, ChevronRight, CircleSlash, Clock, SkipForward } from "lucide-react";
import type { ResolvedItem } from "../types.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";

function itemOrder(item: ResolvedItem): number {
  if (item.__typename === "open_issue") return 0;
  if (item.__typename === "closed_issue") return 1;
  if (item.__typename === "skipped") return 2;
  return 3;
}

function StatusCell({ item, targetRepo }: { item: ResolvedItem; targetRepo: string }) {
  const issueUrl = (n: number) => `https://github.com/${targetRepo}/issues/${n}`;

  switch (item.__typename) {
    case "open_issue":
      return (
        <a href={issueUrl(item.issueNumber)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary underline">
          #{item.issueNumber}
        </a>
      );

    case "closed_issue":
      if (item.stateReason === "not_planned") {
        return (
          <a href={issueUrl(item.issueNumber)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-xs text-muted-foreground underline">
            <CircleSlash size={12} />#{item.issueNumber}
          </a>
        );
      }
      return (
        <a href={issueUrl(item.issueNumber)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-xs text-green-500 underline">
          <Check size={12} />#{item.issueNumber}
        </a>
      );

    case "skipped":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <SkipForward size={12} />Skipped
        </span>
      );

    case "pending":
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />Pending
        </span>
      );
  }
}

const columnHelper = createColumnHelper<ResolvedItem>();

export function CampaignItemsTable({
  items,
  selectedCampaign,
  targetRepo,
}: {
  items: ResolvedItem[];
  selectedCampaign: string | null;
  targetRepo: string;
}) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => itemOrder(a) - itemOrder(b)),
    [items],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusCell item={row.original} targetRepo={targetRepo} />,
      }),
      columnHelper.accessor("path", {
        header: "File",
        cell: (info) => {
          const path = info.getValue();
          const fileUrl = `https://github.com/${targetRepo}/blob/main/${path}`;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-foreground underline truncate block max-w-45"
                >
                  {path}
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="font-mono text-nowrap max-w-max">
                {path}
              </TooltipContent>
            </Tooltip>
          );
        },
      }),
    ],
    [targetRepo],
  );

  const table = useReactTable({
    data: sorted,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 5 } },
  });

  if (!selectedCampaign) {
    return (
      <p className="text-sm text-muted-foreground mt-4">Select a campaign above to view its items.</p>
    );
  }
  if (sorted.length === 0) return null;

  const rows = table.getRowModel().rows;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold font-mono text-foreground uppercase tracking-wide mb-3">
        Items
      </h2>
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full table-auto text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-muted border-b border-border">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="text-left px-3 py-2 text-xs font-semibold font-mono text-muted-foreground whitespace-nowrap"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-muted/50">
                {row.getVisibleCells().map((cell, i) => (
                  <td key={cell.id} className={"px-3 py-2 align-middle " + (i === 0 ? "w-1/3" : "w-2/3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft /> Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
