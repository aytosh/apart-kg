import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/app.js",
  format: "esm",
  target: ["chrome108", "firefox108", "safari16", "edge108"],
  minify: !watch,
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
  banner: {
    js: "/* Apart.kg — bundled by esbuild */",
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[esbuild] watching frontend/src/...");
} else {
  await esbuild.build(options);
  console.log("[esbuild] build complete -> frontend/dist/app.js");
}
