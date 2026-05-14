import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { FormContent, SECRETS } from "../form-component";
import * as service from "../services/github-service";

vi.mock("../services/github-service");

const props = { targetRepo: "owner/repo", token: "test-token" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.getExistingSecrets).mockResolvedValue([]);
  vi.mocked(service.getBranchStatus).mockResolvedValue(false);
});

async function renderAndOpenSecrets() {
  const result = render(<FormContent {...props} />);
  await userEvent.click(screen.getByRole("button", { name: /Get Started/ }));
  return result;
}

describe("GitHub Secrets tab", () => {
  it("shows loader while checking for existing secrets then hides it", async () => {
    // ARRANGE
    let resolve!: (val: string[]) => void;
    vi.mocked(service.getExistingSecrets).mockReturnValue(new Promise((r) => (resolve = r)));

    // ACT
    render(<FormContent {...props} />);

    // ASSERT
    expect(screen.getByRole("alert", { name: "loading" })).toBeInTheDocument();

    resolve([]);
    await waitFor(() =>
      expect(screen.queryByRole("alert", { name: "loading" })).not.toBeInTheDocument()
    );
  });

  it("disables inputs and shows ✓ Set for pre-existing secrets", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([SECRETS[0]]);

    // ACT
    const { container } = await renderAndOpenSecrets();
    await waitFor(() => expect(screen.getAllByText("✓ Set")).toHaveLength(1));

    // ASSERT
    const input = container.querySelector<HTMLInputElement>(`input[name="${SECRETS[0]}"]`);
    expect(input).toBeDisabled();

    const otherInput = container.querySelector<HTMLInputElement>(`input[name="${SECRETS[1]}"]`);
    expect(otherInput).not.toBeDisabled();
  });

  it("unlocks Workflows tab and shows Next button when all secrets are pre-existing", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS]);

    // ACT
    await renderAndOpenSecrets();

    // ASSERT
    await waitFor(() => {
      expect(screen.getAllByText("✓ Set")).toHaveLength(SECRETS.length);
      expect(screen.getByRole("button", { name: /Next: Set up Workflows/ })).toBeInTheDocument();
    });
  });

  it("unlocks Workflows tab and shows Next button after successful form submission", async () => {
    // ARRANGE
    const results = Object.fromEntries(SECRETS.map((s) => [s, "ok" as const]));
    vi.mocked(service.submitSecrets).mockResolvedValue(results);

    await renderAndOpenSecrets();
    await waitFor(() => screen.getByRole("button", { name: "Submit" }));

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    // ASSERT
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next: Set up Workflows/ })).toBeInTheDocument();
    });
  });

  it("does not send pre-existing secrets in the submit payload", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue(["COPILOT_GITHUB_TOKEN"]);
    vi.mocked(service.submitSecrets).mockResolvedValue(
      Object.fromEntries(SECRETS.map((s) => [s, "ok" as const]))
    );

    const { container } = await renderAndOpenSecrets();
    await waitFor(() => expect(screen.getAllByText("✓ Set")).toHaveLength(1));

    const tavilyInput = container.querySelector<HTMLInputElement>(`input[name="TAVILY_API_KEY"]`);
    await userEvent.type(tavilyInput!, "my-tavily-key");

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    // ASSERT
    await waitFor(() => expect(service.submitSecrets).toHaveBeenCalled());

    const submittedData: URLSearchParams = vi.mocked(service.submitSecrets).mock.calls[0][1];
    expect(submittedData.get("COPILOT_GITHUB_TOKEN")).toBeNull();
    expect(submittedData.get("TAVILY_API_KEY")).toBe("my-tavily-key");
  });

  it("shows Restart Installation button when branch already exists", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS]);
    vi.mocked(service.getBranchStatus).mockResolvedValue(true);

    await renderAndOpenSecrets();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next: Set up Workflows/ })).toBeInTheDocument()
    );

    // ACT
    await userEvent.click(screen.getByRole("button", { name: /Next: Set up Workflows/ }));

    // ASSERT
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restart Installation" })).toBeInTheDocument();
      expect(screen.getByText(`An installation branch already exists: feat/add-contenthawk-workflows.`)).toBeInTheDocument();
    });
  });

  it("shows PR link next to success message after workflow completes", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS]);
    vi.mocked(service.getBranchStatus).mockResolvedValue(false);

    const mockEs = new EventTarget() as EventTarget & { close: () => void };
    mockEs.close = vi.fn();
    vi.mocked(service.createWorkflowStream).mockReturnValue(mockEs as unknown as EventSource);

    await renderAndOpenSecrets();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next: Set up Workflows/ })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: /Next: Set up Workflows/ }));

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Set up Workflows" }));

    await act(async () => {
      mockEs.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ type: "link", url: "https://github.com/owner/repo/pull/1" }),
      }));
      mockEs.dispatchEvent(new Event("done"));
    });

    // ASSERT
    await waitFor(() => {
      expect(screen.getByText(`✓ Pull request created successfully.`)).toBeInTheDocument();
       expect(screen.getByRole("link", { name: "https://github.com/owner/repo/pull/1" })).toBeInTheDocument();

    });
  });

  it("shows a safe-to-close message after the workflow completes", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS]);
    vi.mocked(service.getBranchStatus).mockResolvedValue(false);

    const mockEs = new EventTarget() as EventTarget & { close: () => void };
    mockEs.close = vi.fn();
    vi.mocked(service.createWorkflowStream).mockReturnValue(mockEs as unknown as EventSource);

    await renderAndOpenSecrets();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next: Set up Workflows/ })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: /Next: Set up Workflows/ }));

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Set up Workflows" }));

    // ASSERT — message is not shown while the workflow is still running
    expect(screen.queryByText(/you can safely close this tab/i)).not.toBeInTheDocument();

    await act(async () => {
      mockEs.dispatchEvent(new Event("done"));
    });

    await waitFor(() => {
      expect(screen.getByText(/The CLI has finished — you can safely close this tab\./)).toBeInTheDocument();
    });
  });

  it("enables Submit when a pre-existing field is unlocked and a new value is entered, and sends only the overridden value", async () => {
    // ARRANGE
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS]);
    vi.mocked(service.submitSecrets).mockResolvedValue(
      Object.fromEntries(SECRETS.map((s) => [s, "ok" as const]))
    );

    const { container } = await renderAndOpenSecrets();

    await waitFor(() => {
      expect(screen.getAllByText("✓ Set")).toHaveLength(SECRETS.length);
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    });

    const [firstUnlockBtn] = screen.getAllByRole("button", { name: "Unlock to override" });
    await userEvent.click(firstUnlockBtn);

    const input = container.querySelector<HTMLInputElement>(`input[name="${SECRETS[0]}"]`);
    await userEvent.type(input!, "new-secret-value");

    expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    // ASSERT
    await waitFor(() => expect(service.submitSecrets).toHaveBeenCalled());

    const submittedData: URLSearchParams = vi.mocked(service.submitSecrets).mock.calls[0][1];
    expect(submittedData.get(SECRETS[0])).toBe("new-secret-value");
    expect(submittedData.get(SECRETS[1])).toBeNull();
  });

  it("allows unlocking a field after a successful submission", async () => {
    // ARRANGE
    vi.mocked(service.submitSecrets).mockResolvedValue(
      Object.fromEntries(SECRETS.map((s) => [s, "ok" as const]))
    );
    vi.mocked(service.getExistingSecrets).mockResolvedValue([...SECRETS.slice(1)]);

    console.log("Mocked getExistingSecrets:", ...SECRETS.slice(1));

    const { container } = await renderAndOpenSecrets();

    const input = container.querySelector<HTMLInputElement>(`input[name="${SECRETS[0]}"]`);

    userEvent.type(input!, "my-new-value");

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
    {
      expect(service.submitSecrets).toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    });

    // ASSERT
    const secondUnlockButton = screen.getAllByRole("button", { name: "Unlock to override" })[1];
    await userEvent.click(secondUnlockButton);
    const secondInput = container.querySelector<HTMLInputElement>(`input[name="${SECRETS[1]}"]`);
    expect(secondInput).toBeDisabled();
  });

  it("shows an error banner and keeps submit active when a secret fails", async () => {
    // ARRANGE
    const results = {
      [SECRETS[0]]: "ok" as const,
      [SECRETS[1]]: { error: "permission denied" },
    };
    vi.mocked(service.submitSecrets).mockResolvedValue(results);

    await renderAndOpenSecrets();
    await waitFor(() => screen.getByRole("button", { name: "Submit" }));

    // ACT
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    // ASSERT
    await waitFor(() => {
      expect(screen.getByText(/Some secrets failed/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();
    });
  });
});
