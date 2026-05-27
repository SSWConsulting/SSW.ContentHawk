import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { CampaignsPage } from "../pages/campaigns";
import * as contenthawkService from "../services/contenthawk-service";

vi.mock("../services/contenthawk-service");

const props = { targetRepo: "owner/repo" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([]);
  vi.mocked(contenthawkService.fetchCampaignItems).mockResolvedValue({});
  vi.mocked(contenthawkService.fetchOpenIssueCounts).mockResolvedValue({});
});

describe("CampaignsPage", () => {
  it("shows fallback message when no campaigns are returned", async () => {
    render(<CampaignsPage {...props} />);
    await waitFor(() => {
      expect(screen.getByText(/No campaign data available/i)).toBeInTheDocument();
    });
  });

  it("shows campaign names when statuses are loaded", async () => {
    vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([
      { name: "archive-old-posts", percent: 60 },
      { name: "update-docs", percent: 100 },
    ]);

    render(<CampaignsPage {...props} />);
    await waitFor(() => {
      expect(screen.getByText("archive-old-posts")).toBeInTheDocument();
      expect(screen.getByText("update-docs")).toBeInTheDocument();
    });
  });

  it("auto-selects the first campaign on load", async () => {
    vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([
      { name: "first-campaign", percent: 10 },
      { name: "second-campaign", percent: 50 },
    ]);

    render(<CampaignsPage {...props} />);
    await waitFor(() => screen.getByText("first-campaign"));
  });

  it("shows the items table after selecting a campaign", async () => {
    vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([
      { name: "archive-old-posts", percent: 50 },
    ]);
    vi.mocked(contenthawkService.fetchCampaignItems).mockResolvedValue({
      "archive-old-posts": [
        { __typename: "pending", path: "blog/post-1.md", lastUpdated: "2024-01-01", checkedDate: "", categoryList: "", createdDate: "" },
        { __typename: "open_issue", issueNumber: 7, path: "blog/post-2.md", lastUpdated: "2024-01-02", checkedDate: "", categoryList: "", createdDate: "" },
      ],
    });

    render(<CampaignsPage {...props} />);
    await waitFor(() => screen.getByText("archive-old-posts"));
    await userEvent.click(screen.getByText("archive-old-posts"));

    await waitFor(() => {
      expect(screen.getByText("blog/post-1.md")).toBeInTheDocument();
      expect(screen.getByText("blog/post-2.md")).toBeInTheDocument();
    });
  });

  it("renders Pending and open-issue status cells correctly", async () => {
    vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([
      { name: "my-campaign", percent: 25 },
    ]);
    vi.mocked(contenthawkService.fetchCampaignItems).mockResolvedValue({
      "my-campaign": [
        { __typename: "pending", path: "content/a.md", lastUpdated: "", checkedDate: "", categoryList: "", createdDate: "" },
        { __typename: "open_issue", issueNumber: 42, path: "content/b.md", lastUpdated: "", checkedDate: "", categoryList: "", createdDate: "" },
      ],
    });

    render(<CampaignsPage {...props} />);
    await waitFor(() => screen.getByText("my-campaign"));
    await userEvent.click(screen.getByText("my-campaign"));

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "#42" })).toBeInTheDocument();
    });
  });

  it("displays the sum of all open issue counts on load", async () => {
    vi.mocked(contenthawkService.fetchOpenIssueCounts).mockResolvedValue({
      "campaign-a": 3,
      "campaign-b": 7,
    });

    render(<CampaignsPage {...props} />);
    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  it("renders closed and skipped status cells correctly", async () => {
    vi.mocked(contenthawkService.fetchCampaignStatuses).mockResolvedValue([
      { name: "my-campaign", percent: 80 },
    ]);
    vi.mocked(contenthawkService.fetchCampaignItems).mockResolvedValue({
      "my-campaign": [
        { __typename: "closed_issue", issueNumber: 10, stateReason: "completed", path: "content/c.md", lastUpdated: "", checkedDate: "", categoryList: "", createdDate: "" },
        { __typename: "skipped", path: "content/d.md", lastUpdated: "", checkedDate: "", categoryList: "", createdDate: "" },
      ],
    });

    render(<CampaignsPage {...props} />);
    await waitFor(() => screen.getByText("my-campaign"));
    await userEvent.click(screen.getByText("my-campaign"));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /#10/ })).toBeInTheDocument();
      expect(screen.getByText("Skipped")).toBeInTheDocument();
    });
  });
});
