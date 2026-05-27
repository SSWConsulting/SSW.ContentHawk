import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CampaignActions } from "../components/campaign-actions";
import * as contenthawkService from "../services/contenthawk-service";

vi.mock("../services/contenthawk-service");

const defaultProps = {
  openIssueCount: 3,
  judgeStreamUrl: "/stream/judge",
  fixerStreamUrl: "/stream/fixer",
  issuesUrl: "https://github.com/owner/repo/issues",
  pullsUrl: "https://github.com/owner/repo/pulls",
};

type EventSourceListener = (e: Event) => void;

class MockEventSource {
  listeners: Record<string, EventSourceListener[]> = {};
  readyState = 1;

  addEventListener(type: string, handler: EventSourceListener) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(handler);
  }

  emit(type: string, data?: unknown) {
    const event = Object.assign(new Event(type), {
      data: data !== undefined ? JSON.stringify(data) : undefined,
    });
    this.listeners[type]?.forEach((h) => h(event));
  }

  close() {
    this.readyState = EventSource.CLOSED;
  }
}

let mockEs: MockEventSource;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contenthawkService.killServer).mockResolvedValue(undefined);
  mockEs = new MockEventSource();
  vi.stubGlobal("EventSource", class {
    constructor() { return mockEs; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CampaignActions — fixer completes with a PR", () => {
  it("shows a PR link when the fixer stream finishes with a prUrl", async () => {
    render(<CampaignActions {...defaultProps} />);

    await userEvent.click(screen.getByRole("button", { name: /fix issues/i }));

    await act(async () => {
      mockEs.emit("done", {
        prUrl: "https://github.com/owner/repo/pull/42",
        runUrl: "https://github.com/owner/repo/actions/runs/99",
      });
    });

    await waitFor(() => {
      const prLink = screen.getByRole("link", { name: /view pull request/i });
      expect(prLink).toBeInTheDocument();
      expect(prLink).toHaveAttribute("href", "https://github.com/owner/repo/pull/42");
    });
  });
});

describe("CampaignActions — fixer completes without a PR", () => {
  it("shows a workflow run link when the fixer stream finishes with no prUrl", async () => {
    render(<CampaignActions {...defaultProps} />);

    await userEvent.click(screen.getByRole("button", { name: /fix issues/i }));

    await act(async () => {
      mockEs.emit("done", {
        prUrl: null,
        runUrl: "https://github.com/owner/repo/actions/runs/99",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /view pull request/i })).not.toBeInTheDocument();

      const runLink = screen.getByRole("link", { name: /view workflow run/i });
      expect(runLink).toBeInTheDocument();
      expect(runLink).toHaveAttribute("href", "https://github.com/owner/repo/actions/runs/99");
    });
  });
});

describe("CampaignActions — close tab message", () => {
  it("shows the close tab message after a successful run", async () => {
    render(<CampaignActions {...defaultProps} />);

    await userEvent.click(screen.getByRole("button", { name: /generate issues/i }));

    await act(async () => {
      mockEs.emit("done");
    });

    await waitFor(() => {
      expect(screen.getByText(/you can safely close this tab/i)).toBeInTheDocument();
    });
  });

  it("shows the close tab message after a failed run", async () => {
    render(<CampaignActions {...defaultProps} />);

    await userEvent.click(screen.getByRole("button", { name: /generate issues/i }));

    await act(async () => {
      mockEs.emit("failed", "Something went wrong");
    });

    await waitFor(() => {
      expect(screen.getByText(/you can safely close this tab/i)).toBeInTheDocument();
    });
  });
});
