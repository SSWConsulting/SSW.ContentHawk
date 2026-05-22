import React, { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Check, CircleSlash, Clock, SkipForward } from "lucide-react";
import { useOctokit } from "../contexts/octokit-context.tsx";
import { fetchCampaignItems } from "../services/contenthawk-service.ts";
import type { ContentCatalog, CheckResult } from "../types.ts";

type ItemGroup = "issue" | "skipped" | "pending";

interface FlatItem {
  campaign: string;
  path: string;
  checkResult: CheckResult;
  lastUpdated: string;
  group: ItemGroup;
}

const GROUP_ORDER: Record<ItemGroup, number> = { issue: 0, skipped: 1, pending: 2 };

function groupOf(checkResult: CheckResult): ItemGroup {
  if (typeof checkResult === "number") return "issue";
  if (checkResult === "skipped") return "skipped";
  return "pending";
}

function ruleSlug(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? path;
}

const columnHelper = createColumnHelper<FlatItem>();

function IssueStatusCell({
  owner,
  repo,
  issue,
}: {
  owner: string;
  repo: string;
  issue: number;
}) {
  const octokit = useOctokit();
  const [issueData, setIssueData] = useState<{
    state: string;
    state_reason: string | null;
  } | null>(null);

  useEffect(() => {
    octokit.rest.issues
      .get({ owner, repo, issue_number: issue })
      .then(({ data }) =>
        setIssueData({ state: data.state, state_reason: data.state_reason ?? null }),
      )
      .catch(() => {});
  }, [owner, repo, issue]);

  if (!issueData) {
    return <span className="font-mono text-xs text-[#0969da]">#{issue}</span>;
  }

  if (issueData.state === "closed") {
    if (issueData.state_reason === "not_planned") {
      return (
        <span className="flex items-center gap-1 font-mono text-xs text-[#555]">
          <CircleSlash size={12} />#{issue}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 font-mono text-xs text-[#1a7f37]">
        <Check size={12} />#{issue}
      </span>
    );
  }

  return <span className="font-mono text-xs text-[#0969da]">#{issue}</span>;
}

function StatusCell({ row }: { row: FlatItem; owner: string; repo: string }) {
  if (row.group === "skipped") {
    return (
      <span className="flex items-center gap-1 text-xs text-[#555]">
        <SkipForward size={12} />
        Skipped
      </span>
    );
  }
  if (row.group === "pending") {
    return (
      <span className="flex items-center gap-1 text-xs text-[#555]">
        <Clock size={12} />
        Pending
      </span>
    );
  }
  return null;
}

export function CampaignItemsTable({
  targetRepo,
  token,
  selectedCampaign,
}: {
  targetRepo: string;
  token: string;
  selectedCampaign: string | null;
}) {
  const [catalog, setCatalog] = useState<ContentCatalog>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaignItems(token)
      .then(setCatalog)
      .finally(() => setLoading(false));
  }, [token]);

  const [owner, repo] = targetRepo.split("/");

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    for (const [campaign, contentItems] of Object.entries(catalog)) {
      if (selectedCampaign && campaign !== selectedCampaign) continue;
      for (const item of contentItems) {
        items.push({
          campaign,
          path: item.path,
          checkResult: item.checkResult,
          lastUpdated: item.lastUpdated,
          group: groupOf(item.checkResult),
        });
      }
    }
    return items.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
  }, [catalog, selectedCampaign]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const item = row.original;
          if (item.group === "issue") {
            return (
              <IssueStatusCell
                owner={owner}
                repo={repo}
                issue={item.checkResult as number}
              />
            );
          }
          return <StatusCell row={item} owner={owner} repo={repo} />;
        },
      }),
      columnHelper.accessor("path", {
        header: "Rule",
        cell: (info) => (
          <span
            className="font-mono text-xs text-[#1a1a1a] truncate block max-w-45"
            title={info.getValue()}
          >
            {ruleSlug(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("campaign", {
        header: "Campaign",
        cell: (info) => (
          <span
            className="font-mono text-xs text-[#555] truncate block max-w-35"
            title={info.getValue()}
          >
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [owner, repo],
  );

  const table = useReactTable({
    data: flatItems,
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
  if (loading) {
    return <p className="text-sm text-[#555] mt-6">Loading items…</p>;
  }
  if (flatItems.length === 0) return null;

  const rows = table.getRowModel().rows;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold font-mono text-[#555] uppercase tracking-wide mb-3">
        Items
      </h2>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm border-collapse">
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
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
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