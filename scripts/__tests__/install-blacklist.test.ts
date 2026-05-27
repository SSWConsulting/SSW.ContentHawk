import { describe, it, expect, vi } from "vitest";

const { capturedHandlers } = vi.hoisted(() => ({
  capturedHandlers: {} as Record<string, Function>,
}));

vi.mock("../install-helpers", () => ({
  checkBranchExists: vi.fn().mockReturnValue(false),
  closePRsForBranch: vi.fn().mockResolvedValue(undefined),
  deleteBranch: vi.fn().mockResolvedValue(undefined),
  sparseClone: vi.fn().mockResolvedValue(undefined),
  compileWorkflows: vi.fn().mockResolvedValue(undefined),
  gitRun: vi.fn().mockResolvedValue(undefined),
  createPR: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
    spawnSync: vi.fn((cmd: string) => ({
      status: cmd === "git" ? 1 : 0,
      stdout: "fake-token\n",
    stderr: "",
  })),
  spawn: vi.fn(),
  }
}
});

vi.mock("esbuild", () => ({
  build: vi.fn().mockResolvedValue({ outputFiles: [{ text: "" }] }),
}));

vi.mock("postcss", () => ({
  default: vi.fn(() => ({ process: vi.fn().mockResolvedValue({ css: "" }) })),
}));

vi.mock("@tailwindcss/postcss", () => ({ default: {} }));

vi.mock("@/constants.ts", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    INSTALL_COPY_BLACKLIST: ["publish.yml"],
  };
});

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(""),
    mkdtemp: vi.fn().mockResolvedValue("/tmp/test-install"),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    copyFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("express", () => {
  const app = {
    get: vi.fn((route: string, handler: Function) => { capturedHandlers[route] = handler; }),
    post: vi.fn(),
    use: vi.fn(),
    listen: vi.fn(() => ({
      address: () => ({ port: 12345 }),
      once: (_evt: string, cb: Function) => cb(),
    })),
  };
  const expressFn = vi.fn(() => app);
  (expressFn as any).static = vi.fn();
  (expressFn as any).urlencoded = vi.fn(() => (_req: any, _res: any, next: Function) => next());
  (expressFn as any).json = vi.fn(() => (_req: any, _res: any, next: Function) => next());
  return { default: expressFn };
});

describe("install /workflow-stream blacklist", () => {
  it("does not call fs.copyFile for blacklisted files", async () => {
    const fs = (await import("node:fs/promises")).default;
    vi.mocked(fs.readdir).mockResolvedValue([
      "content-campaign.lock.yml",
      "publish.yml",
      "content-judge.lock.yml",
    ]);

    const { main } = await import("../content-hawk");

    main(["install", "owner/repo"]);

    await new Promise((r) => setTimeout(r, 50));

    const handler = capturedHandlers["/workflow-stream"];

    expect(handler, "/workflow-stream handler should be registered").toBeDefined();

    const res = {
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
    await handler({ query: {} }, res);

    const copiedSrcs = vi.mocked(fs.copyFile).mock.calls.map(([src]: [string]) => src);
    expect(copiedSrcs.some((s: string) => s.includes("publish.yml"))).toBe(false);
    expect(copiedSrcs.some((s: string) => s.includes("content-campaign.lock.yml"))).toBe(true);
    expect(copiedSrcs.some((s: string) => s.includes("content-judge.lock.yml"))).toBe(true);
  });
});
