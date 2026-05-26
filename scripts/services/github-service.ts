import type { SecretResult } from "../pages/install";

export async function getExistingSecrets(): Promise<string[]> {
  const res = await fetch("/existing-secrets");
  const data = await res.json() as { existing: string[] };
  return data.existing ?? [];
}

export async function getBranchStatus(): Promise<boolean> {
  const res = await fetch("/branch-status");
  const data = await res.json() as { exists: boolean };
  return data.exists;
}

export async function submitSecrets(
  formData: URLSearchParams,
): Promise<Record<string, SecretResult>> {
  formData.forEach((value, key) => {
    if (value === "pre-existing") {
      formData.delete(key);
    }
  });

  const res = await fetch("/submit", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json() as { results: Record<string, SecretResult> };
  return payload.results ?? {};
}

export function createWorkflowStream(restart: boolean): EventSource {
  return new EventSource(`/workflow-stream${restart ? "?restart=true" : ""}`);
}