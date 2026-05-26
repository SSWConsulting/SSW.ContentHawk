import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NewCampaignPage } from "../pages/new-campaign";

type MockEs = EventTarget & { close: ReturnType<typeof vi.fn>; readyState: number };

function makeMockEs(): MockEs {
  return Object.assign(new EventTarget(), { close: vi.fn(), readyState: 1 });
}

let mockEs: MockEs;
let mockFetch: ReturnType<typeof vi.fn>;

const props = { targetRepo: "owner/repo" };

beforeEach(() => {
  vi.clearAllMocks();

  mockEs = makeMockEs();
  const MockEventSource = vi.fn(function MockES(_url: string) { return mockEs; });
  (MockEventSource as unknown as { CLOSED: number }).CLOSED = 2;
  vi.stubGlobal("EventSource", MockEventSource);

  mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: null }) });
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAllFields(container: HTMLElement) {
  await userEvent.type(container.querySelector('textarea[name="intent"]')!, "archive outdated posts");
  await userEvent.type(container.querySelector('input[name="search_scope"]')!, "all blog files");
  await userEvent.type(container.querySelector('input[name="label_name"]')!, "archive-old-posts");
  await userEvent.type(container.querySelector('textarea[name="processing_priority"]')!, "sort by date");
  await userEvent.type(container.querySelector('textarea[name="issue_preferences"]')!, "max 20 issues");
  await userEvent.type(container.querySelector('textarea[name="pr_preferences"]')!, "bundle 5 per PR");
}

describe("NewCampaignPage", () => {
  it("renders all six form fields", () => {
    const { container } = render(<NewCampaignPage {...props} />);
    expect(container.querySelector('textarea[name="intent"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="search_scope"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="label_name"]')).toBeInTheDocument();
    expect(container.querySelector('textarea[name="processing_priority"]')).toBeInTheDocument();
    expect(container.querySelector('textarea[name="issue_preferences"]')).toBeInTheDocument();
    expect(container.querySelector('textarea[name="pr_preferences"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Workflow" })).toBeInTheDocument();
  });

  it("shows a Required error for every empty field on submit", async () => {
    render(<NewCampaignPage {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));
    expect(screen.getAllByText("Required")).toHaveLength(6);
  });

  it("clears the validation error for a field when the user types into it", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));
    expect(screen.getAllByText("Required")).toHaveLength(6);

    await userEvent.type(container.querySelector('textarea[name="intent"]')!, "some intent");
    expect(screen.getAllByText("Required")).toHaveLength(5);
  });

  it("hides the form and shows a disabled Running button while the workflow is in progress", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    expect(screen.getByRole("button", { name: /Running/ })).toBeDisabled();
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows a success message when the done event fires", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(new Event("done"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Workflow completed successfully/i)).toBeInTheDocument();
    });
  });

  it("shows a PR link when done event includes a runId and the fetch returns a URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://github.com/owner/repo/pull/42" }),
    });

    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(new MessageEvent("done", { data: JSON.stringify({ runId: "run-123" }) }));
    });

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /View generated PR/i });
      expect(link).toHaveAttribute("href", "https://github.com/owner/repo/pull/42");
    });
  });

  it("shows an error message when the failed event fires", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(new MessageEvent("failed", { data: JSON.stringify("permission denied") }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Workflow failed/i)).toBeInTheDocument();
    });
  });

  it("does not re-show the form after the workflow fails", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(new MessageEvent("failed", { data: JSON.stringify("permission denied") }));
    });

    await waitFor(() => expect(screen.getByText(/Workflow failed/i)).toBeInTheDocument());
    expect(container.querySelector("form")).toBeNull();
  });

  it("appends log messages to the log panel during a run", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify({ type: "log", message: "Cloning repository…" }) }),
      );
      mockEs.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify({ type: "log", message: "Running workflows…" }) }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Cloning repository…")).toBeInTheDocument();
      expect(screen.getByText("Running workflows…")).toBeInTheDocument();
    });
  });

  it("renders a link-type log entry as an anchor element", async () => {
    const { container } = render(<NewCampaignPage {...props} />);
    await fillAllFields(container);
    await userEvent.click(screen.getByRole("button", { name: "Run Workflow" }));

    await act(async () => {
      mockEs.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ type: "link", message: "View run", url: "https://github.com/owner/repo/actions/runs/1" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "View run" })).toBeInTheDocument();
    });
  });
});
