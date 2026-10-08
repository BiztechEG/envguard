/**
 * Key-level comparison of two env sources.
 */

/**
 * @typedef {object} EnvDiff
 * @property {string[]} added      Keys only present in `b`.
 * @property {string[]} removed    Keys only present in `a`.
 * @property {{key: string, from: string, to: string}[]} changed
 * @property {string[]} same
 */

/**
 * @param {Map<string, string>|Record<string, string>} a
 * @param {Map<string, string>|Record<string, string>} b
 * @returns {EnvDiff}
 */
export function diffEnv(a, b) {
  const left = toEntries(a);
  const right = toEntries(b);
  /** @type {EnvDiff} */
  const diff = { added: [], removed: [], changed: [], same: [] };

  for (const [key, value] of left) {
    if (!right.has(key)) diff.removed.push(key);
    else if (right.get(key) !== value) diff.changed.push({ key, from: value, to: right.get(key) });
    else diff.same.push(key);
  }
  for (const key of right.keys()) {
    if (!left.has(key)) diff.added.push(key);
  }
  return diff;
}

function toEntries(input) {
  return input instanceof Map ? input : new Map(Object.entries(input));
}
