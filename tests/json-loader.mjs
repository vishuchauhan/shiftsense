// Lets Node import .json files the way Vite does (without import attributes).
export async function load(url, context, next) {
  if (url.endsWith(".json")) {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(new URL(url), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${text};` };
  }
  return next(url, context);
}
