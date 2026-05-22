import React from "react";

export interface CampaignStatus {
  name: string;
  percent: number;
}

function CircleProgress({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={percent === 100 ? "#1a7f37" : "#0969da"}
        strokeWidth="4"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#1a1a1a">
        {percent}%
      </text>
    </svg>
  );
}

interface CampaignStatusPanelProps {
  statuses: CampaignStatus[];
  selectedCampaign?: string | null;
  onSelectCampaign?: (name: string) => void;
}

export function CampaignStatusPanel({
  statuses,
  selectedCampaign,
  onSelectCampaign,
}: CampaignStatusPanelProps) {
  if (statuses.length === 0) return null;
  const selectable = Boolean(onSelectCampaign);
  return (
    <div className="mb-6 border border-gray-200 rounded p-4 bg-gray-50">
      <h2 className="text-xs font-semibold font-mono text-[#555] uppercase tracking-wide mb-3">
        Campaigns
      </h2>
      <ul className="flex flex-col gap-2">
        {statuses.map((s) => {
          const isSelected = selectedCampaign === s.name;
          return (
            <li
              key={s.name}
              onClick={() => onSelectCampaign?.(s.name)}
              className={[
                "flex items-center gap-3 px-2 py-1 rounded transition-colors",
                selectable ? "cursor-pointer" : "",
                isSelected
                  ? "bg-white border border-[#0969da]"
                  : selectable
                    ? "hover:bg-white hover:border hover:border-gray-200 border border-transparent"
                    : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <CircleProgress percent={s.percent} />
              <span className="font-mono text-sm text-[#1a1a1a] truncate" title={s.name}>
                {s.name}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
