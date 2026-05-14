import type { SecretResult } from "../form-component";

export async function killServer(): Promise<void> {
  await fetch("/kill", { method: "POST" });
}

export async function getExistingSecrets(token: string): Promise<string[]> {
  const res = await fetch(`/existing-secrets?token=${encodeURIComponent(token)}`);
  const data = await res.json() as { existing: string[] };
  return data.existing ?? [];
}

export async function getBranchStatus(token: string): Promise<boolean> {
  const res = await fetch(`/branch-status?token=${encodeURIComponent(token)}`);
  const data = await res.json() as { exists: boolean };
  return data.exists;
}

export async function submitSecrets(
  token: string,
  formData: URLSearchParams,
): Promise<Record<string, SecretResult>> {

  console.log("Submitting secrets with data:", Object.fromEntries(formData.entries()));

  formData.forEach((value, key) => {
    if (value === "pre-existing") {
      formData.delete(key);
    }
  });

  const res = await fetch(`/submit?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json() as { results: Record<string, SecretResult> };
  return payload.results ?? {};
}

export function createWorkflowStream(token: string, restart: boolean): EventSource {
  const qs = `/workflow-stream?token=${encodeURIComponent(token)}${restart ? "&restart=true" : ""}`;
  return new EventSource(qs);
}