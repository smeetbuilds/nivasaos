import { Glob, Transpiler } from "bun";

const patterns = ["app/**/*.{js,jsx}", "components/**/*.{js,jsx}", "lib/**/*.js", "plugins/**/*.js", "scripts/**/*.js", "*.mjs"];
const files = new Set();
for (const pattern of patterns) {
  const glob = new Glob(pattern);
  for await (const filename of glob.scan({ cwd: process.cwd(), onlyFiles: true })) files.add(filename);
}

const transpilers = {
  js: new Transpiler({ loader: "js", target: "bun" }),
  jsx: new Transpiler({ loader: "jsx", target: "bun" })
};
const errors = [];
for (const filename of [...files].sort()) {
  try {
    const source = await Bun.file(filename).text();
    const loader = filename.endsWith(".mjs") ? "js" : "jsx";
    transpilers[loader].transformSync(source);
    if (/^(<{7}|={7}|>{7})/m.test(source)) throw new Error("Unresolved merge-conflict marker");
  } catch (error) {
    errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Parsed ${files.size} JavaScript/JSX source files successfully.`);
