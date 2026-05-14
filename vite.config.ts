import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { build as esbuild } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  // Pre-build browser client and CSS at config time so the final bundle
  // has no runtime dependency on esbuild or postcss.
  const clientResult = await esbuild({
    entryPoints: [path.join(root, "scripts/form-client.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    minify: true,
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  });
  const clientBundle = clientResult.outputFiles[0].text;

  const cssPath = path.join(root, "scripts/form.css");
  const rawCSS = await fs.readFile(cssPath, "utf-8");
  const cssResult = await postcss([tailwindcss]).process(rawCSS, { from: cssPath });
  const preBuiltCSS = cssResult.css;

  // Write real stub files so rolldown can resolve and load them as normal
  // modules rather than needing virtual-module support.
  const stubDir = path.join(root, "node_modules/.vite-stubs");
  await fs.mkdir(stubDir, { recursive: true });

  const stubs: Record<string, string> = {
    "esbuild.mjs": `export const build = async () => ({ outputFiles: [{ text: ${JSON.stringify(clientBundle)} }] });`,
    "postcss.mjs": `export default () => ({ process: async () => ({ css: ${JSON.stringify(preBuiltCSS)} }) });`,
    "tailwind-postcss.mjs": `export default {};`,
  };
  for (const [file, code] of Object.entries(stubs)) {
    await fs.writeFile(path.join(stubDir, file), code);
  }

  const inlineAssets: Plugin = {
    name: "inline-assets",
    enforce: "pre",
    resolveId(id) {
      if (id === "esbuild") return path.join(stubDir, "esbuild.mjs");
      if (id === "postcss") return path.join(stubDir, "postcss.mjs");
      if (id === "@tailwindcss/postcss") return path.join(stubDir, "tailwind-postcss.mjs");
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if ("code" in chunk && chunk.fileName === "install-env.js") {
          // Replace the dev shebang from the source with the node one.
          // Using banner: causes a rolldown bug that truncates the output.
          chunk.code = chunk.code.replace(/^#!.*\n/, "#!/usr/bin/env node\n");
        }
      }
    },
    async writeBundle(options) {
      const outDir = options.dir ?? path.join(root, "dist");
      await fs.copyFile(cssPath, path.join(outDir, "form.css"));
    },
  };

  const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ]);

  return {
    plugins: [inlineAssets, react()],
    build: {
      outDir: "ssw-contenthawk/commands/scripts",
      target: "node18",
      ssr: "scripts/install.ts",
      rollupOptions: {
        external: (id: string) => nodeBuiltins.has(id) || id.endsWith(".node"),
        treeshake: true,
        output: {
          format: "cjs",
          entryFileNames: "install.js",
        },
      },
    },
    ssr: {
      noExternal: true,
      target: "node",
    },
  };
});
