await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    target: "node",
    minify: true,
    sourcemap: "external",
    banner: "#!/usr/bin/env node",
});
