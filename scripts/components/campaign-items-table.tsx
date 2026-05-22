import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Check, CircleSlash, Clock, SkipForward } from "lucide-react";
import type { ResolvedItem } from "../types.ts";

// function ruleSlug(path: string): string {
//   const parts = path.split("/");
//   return parts[parts.length - 2] ?? path;
// }

function itemOrder(item: ResolvedItem): number {
  if (item.__typename === "open_issue") return 0;
  if (item.__typename === "closed_issue") return 1;
  if (item.__typename === "skipped") return 2;
  return 3;
}

function StatusCell({ item }: { item: ResolvedItem }) {
  switch (item.__typename) {
    case "open_issue":
      return <span className="font-mono text-xs text-[#0969da]">#{item.issueNumber}</span>;

    case "closed_issue":
      if (item.stateReason === "not_planned") {
        return (
          <span className="flex items-center gap-1 font-mono text-xs text-[#555]">
            <CircleSlash size={12} />#{item.issueNumber}
          </span>
        );
      }
      return (
        <span className="flex items-center gap-1 font-mono text-xs text-[#1a7f37]">
          <Check size={12} />#{item.issueNumber}
        </span>
      );

    case "skipped":
      return (
        <span className="flex items-center gap-1 text-xs text-[#555]">
          <SkipForward size={12} />Skipped
        </span>
      );

    case "pending":
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-[#555]">
          <Clock size={12} />Pending
        </span>
      );
  }
}

const columnHelper = createColumnHelper<ResolvedItem>();

export function CampaignItemsTable({
  items,
  selectedCampaign,
}: {
  items: ResolvedItem[];
  selectedCampaign: string | null;
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
        cell: ({ row }) => <StatusCell item={row.original} />,
      }),
      columnHelper.accessor("path", {
        header: "Rule",
        cell: (info) => (
          <span
            className="font-mono text-xs text-[#1a1a1a] truncate block max-w-45"
            title={info.getValue()}
          >
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [],
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
      <p className="text-sm text-[#555] mt-4">Select a campaign above to view its items.</p>
    );
  }
  if (sorted.length === 0) return null;

  const rows = table.getRowModel().rows;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold font-mono text-[#555] uppercase tracking-wide mb-3">
        Items
      </h2>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full table-auto text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-gray-50 border-b border-gray-200">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="text-left px-3 py-2 text-xs font-semibold font-mono text-[#555] whitespace-nowrap"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                {row.getVisibleCells().map((cell,i) => (
                  <td key={cell.id} className={"px-3 py-2 align-middle "+ (i === 0 ? "w-1/3" : "w-2/3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-[#555]">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}