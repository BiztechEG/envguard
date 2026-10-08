/**
 * Keeps `.env.example` in step with `.env`: finds variables that exist in the
 * real file but were never declared in the example, and appends them.
 */

/**
 * @param {import('./parse-env.js').ParsedEnv} env
 * @param {import('./parse-env.js').ParsedEnv} example
 * @returns {string[]} Keys present in `env` but missing from `example`, in file order.
 */
export function missingFromExample(env, example) {
  const declared = new Set(example.entries.map((e) => e.key));
  const seen = new Set();
  const missing = [];
  for (const entry of env.entries) {
    if (declared.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    missing.push(entry.key);
  }
  return missing;
}

/**
 * Append `KEY=` lines for each key to the example source, preserving the
 * existing content byte for byte.
 * @param {string} exampleSource
 * @param {string[]} keys
 * @returns {string}
 */
export function appendToExample(exampleSource, keys) {
  if (!keys.length) return exampleSource;
  let out = exampleSource;
  if (out.length && !out.endsWith('\n')) out += '\n';
  if (out.length && !out.endsWith('\n\n')) out += '\n';
  out += `${keys.map((key) => `${key}=`).join('\n')}\n`;
  return out;
}
