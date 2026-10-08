/**
 * A small, dependency-free parser for dotenv-style files.
 *
 * Supported syntax:
 *
 *   KEY=value
 *   export KEY=value
 *   KEY="double quoted"        # supports \n \r \t \" \\ escapes and may span lines
 *   KEY='single quoted'        # taken literally
 *   KEY=value # inline comment # a "#" starts a comment only when preceded by whitespace
 *   # full-line comment
 *
 * The parser never throws on bad input. Problems are collected in `errors`
 * with 1-based line numbers so they can be reported to the user.
 */

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * @typedef {object} EnvEntry
 * @property {string} key
 * @property {string} value       Unquoted, unescaped value.
 * @property {number} line        1-based line where the entry starts.
 * @property {number} endLine     1-based line where the entry ends (differs for multi-line values).
 * @property {'"'|"'"|null} quote Quote character used, if any.
 * @property {boolean} exported   True when written as `export KEY=value`.
 */

/**
 * @typedef {object} ParseProblem
 * @property {number} line
 * @property {string} message
 */

/**
 * @typedef {object} ParsedEnv
 * @property {EnvEntry[]} entries
 * @property {ParseProblem[]} errors
 * @property {{key: string, line: number, firstLine: number}[]} duplicates
 */

/**
 * Parse the text of a dotenv file.
 * @param {string} source
 * @returns {ParsedEnv}
 */
export function parseEnv(source) {
  const lines = String(source).split(/\r?\n/);
  /** @type {EnvEntry[]} */
  const entries = [];
  /** @type {ParseProblem[]} */
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    let rest = trimmed;
    let exported = false;
    const exportMatch = /^export\s+(.*)$/.exec(rest);
    if (exportMatch) {
      exported = true;
      rest = exportMatch[1];
    }

    const eq = rest.indexOf('=');
    if (eq === -1) {
      errors.push({ line: lineNo, message: `expected KEY=value but found "${truncate(trimmed)}"` });
      continue;
    }

    const key = rest.slice(0, eq).trim();
    if (key === '') {
      errors.push({ line: lineNo, message: 'missing variable name before "="' });
      continue;
    }
    if (!KEY_RE.test(key)) {
      errors.push({
        line: lineNo,
        message: `invalid variable name "${truncate(key)}" (use letters, digits and underscores; it cannot start with a digit)`,
      });
      continue;
    }

    const afterEq = rest.slice(eq + 1).trim();
    let value;
    /** @type {'"'|"'"|null} */
    let quote = null;
    let endLine = lineNo;

    if (afterEq[0] === '"' || afterEq[0] === "'") {
      quote = /** @type {'"'|"'"} */ (afterEq[0]);
      let buffer = afterEq.slice(1);
      let closeAt = findClosingQuote(buffer, quote);
      let j = i;
      while (closeAt === -1 && j + 1 < lines.length) {
        j++;
        buffer += '\n' + lines[j];
        closeAt = findClosingQuote(buffer, quote);
      }
      if (closeAt === -1) {
        errors.push({
          line: lineNo,
          message: `unterminated ${quote === '"' ? 'double' : 'single'}-quoted value for ${key}`,
        });
        // Resume on the next line so one stray quote does not hide every
        // variable below it.
        continue;
      }
      i = j;
      endLine = j + 1;
      const tail = buffer.slice(closeAt + 1).trim();
      if (tail !== '' && !tail.startsWith('#')) {
        errors.push({ line: endLine, message: `unexpected text after closing quote for ${key}: "${truncate(tail)}"` });
        continue;
      }
      value = buffer.slice(0, closeAt);
      if (quote === '"') value = unescapeDoubleQuoted(value);
    } else {
      value = stripInlineComment(afterEq).trim();
    }

    entries.push({ key, value, line: lineNo, endLine, quote, exported });
  }

  return { entries, errors, duplicates: findDuplicates(entries) };
}

/**
 * Build a key → entry map. When a key appears more than once the last one wins,
 * matching how shells and most dotenv loaders behave.
 * @param {EnvEntry[]} entries
 * @returns {Map<string, EnvEntry>}
 */
export function toMap(entries) {
  const map = new Map();
  for (const entry of entries) map.set(entry.key, entry);
  return map;
}

/**
 * Build a plain key → value object (last value wins).
 * @param {EnvEntry[]} entries
 * @returns {Record<string, string>}
 */
export function toObject(entries) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of entries) out[entry.key] = entry.value;
  return out;
}

function findClosingQuote(text, quote) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === '"' && ch === '\\') {
      i++; // skip the escaped character
      continue;
    }
    if (ch === quote) return i;
  }
  return -1;
}

function stripInlineComment(text) {
  const match = /(^|\s)#/.exec(text);
  return match ? text.slice(0, match.index) : text;
}

const ESCAPES = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', $: '$' };

function unescapeDoubleQuoted(text) {
  return text.replace(/\\(.)/gs, (whole, ch) => (ch in ESCAPES ? ESCAPES[ch] : whole));
}

function findDuplicates(entries) {
  const firstSeen = new Map();
  const duplicates = [];
  for (const entry of entries) {
    if (firstSeen.has(entry.key)) {
      duplicates.push({ key: entry.key, line: entry.line, firstLine: firstSeen.get(entry.key) });
    } else {
      firstSeen.set(entry.key, entry.line);
    }
  }
  return duplicates;
}

function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
