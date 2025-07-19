#!/usr/bin/env bun

import { $ } from "bun";

// Build configuration for @sync-engine/core
const buildTargets = [
  {
    entrypoint: "src/index.ts",
    outdir: "dist",
    formats: ["esm", "cjs"]
  },
  {
    entrypoint: "src/adapters/index.ts", 
    outdir: "dist/adapters",
    formats: ["esm", "cjs"]
  },
  {
    entrypoint: "src/middleware/index.ts",
    outdir: "dist/middleware", 
    formats: ["esm", "cjs"]
  },
  {
    entrypoint: "src/schema/index.ts",
    outdir: "dist/schema",
    formats: ["esm", "cjs"]
  },
  {
    entrypoint: "src/features/index.ts",
    outdir: "dist/features",
    formats: ["esm", "cjs"]
  }
];

async function build() {
  console.log("🔨 Building bundles...");
  
  for (const target of buildTargets) {
    console.log(`Building ${target.entrypoint}...`);
    
    try {
      // ESM build
      if (target.formats.includes("esm")) {
        const result = await Bun.build({
          entrypoints: [target.entrypoint],
          outdir: target.outdir,
          target: "bun",
          format: "esm",
          naming: "index.js",
          external: ["zustand", "surrealdb", "@surrealdb/wasm"],
          minify: false,
          sourcemap: "external"
        });
        
        if (!result.success) {
          console.error(`ESM build failed for ${target.entrypoint}:`, result.logs);
        }
      }
      
      // CJS build  
      if (target.formats.includes("cjs")) {
        const result = await Bun.build({
          entrypoints: [target.entrypoint],
          outdir: target.outdir,
          target: "node", 
          format: "cjs",
          naming: "index.cjs",
          external: ["zustand", "surrealdb", "@surrealdb/wasm"],
          minify: false,
          sourcemap: "external"
        });
        
        if (!result.success) {
          console.error(`CJS build failed for ${target.entrypoint}:`, result.logs);
        }
      }
    } catch (error) {
      console.error(`Build failed for ${target.entrypoint}:`, error);
    }
  }
  
  console.log("✅ Build complete!");
}

if (import.meta.main) {
  build().catch(console.error);
}