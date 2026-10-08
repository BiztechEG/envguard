/**
 * Turns an annotated `.env.example` file into a validation schema.
 *
 * Every variable in the example file becomes a rule. The comment block written
 * directly above a variable (no blank line in between) describes it. Plain
 * comment text becomes the description; words starting with `@` are
 * annotations:
 *
 *   # Public URL of the API
 *   # @type url
 *   API_URL=https://api.example.com
 *
 *   # @type int @min 1 @max 65535
 *   PORT=3000
 *
 *   # @enum development,production,test
 *   NODE_ENV=development
 *
 *   # @optional @secret
 *   SENTRY_DSN=
 *
 * Supported annotations:
 *   @type <t>        string (default) | int | float | bool | url | email | port | json | uuid | enum
 *   @enum a,b,c      allowed values (implies @type enum)
 *   @pattern <re>    JavaScript regular expression the value must match (rest of the line);
 *                    write /re/flags to use flags such as i
 *   @min / @max      numeric bounds for numeric types, length bounds for strings
 *   @optional        variable may be missing or empty
 *   @required        the default; included for clarity
 *   @secret          value is sensitive: never printed in messages or generated docs
 *   @desc <text>     description (rest of the line); plain comment text works too
 *
 * An `@` glued to a word (like an email address) is not an annotation.
 * A commented-out variable such as `# REDIS_URL=redis://localhost` ends the
 * comment block, so it never becomes part of the next variable's description.
 */

import { parseEnv } from './parse-env.js';

export const TYPES = ['string', 'int', 'float', 'bool', 'url', 'email', 'port', 'json', 'uuid', 'enum'];

const TYPE_ALIASES = {
  str: 'string',
  text: 'string',
  integer: 'int',
  number: 'float',
  double: 'float',
  decimal: 'float',
  boolean: 'bool',
  uri: 'url',
  oneof: 'enum',
};

const REST_OF_LINE_TAGS = new Set(['pattern', 'regex', 'desc', 'description']);

/**
 * @typedef {object} Rule
 * @property {string} key
 * @property {number} line          Line in the example file.
 * @property {string} type          One of TYPES.
 * @property {boolean} required
 * @property {string[]|null} enum
 * @property {string|null} pattern
 * @property {string} patternFlags  Regular expression flags, e.g. "i".
 * @property {number|null} min
 * @property {number|null} max
 * @property {boolean} secret
 * @property {string} description
 * @property {string} example       Value written in the example file.
 */

/**
 * @typedef {object} Schema
 * @property {Rule[]} rules
 * @property {{line: number, message: string}[]} errors
 * @property {{line: number, message: string}[]} warnings
 */

/**
 * @param {string} source Text of the `.env.example` file.
 * @returns {Schema}
 */
export function parseSchema(source) {
  const lines = String(source).split(/\r?\n/);
  const parsed = parseEnv(source);
  const errors = parsed.errors.map((e) => ({ line: e.line, message: e.message }));
  /** @type {{line: number, message: string}[]} */
  const warnings = [];

  for (const dup of parsed.duplicates) {
    errors.push({ line: dup.line, message: `${dup.key} is declared twice (first on line ${dup.firstLine})` });
  }

  const rules = parsed.entries.map((entry) => buildRule(entry, commentBlockAbove(lines, entry.line), errors, warnings));
  return { rules, errors, warnings };
}

/**
 * Collect the contiguous comment lines directly above `lineNo` (1-based),
 * with the leading `#` removed, in file order.
 */
function commentBlockAbove(lines, lineNo) {
  const block = [];
  for (let i = lineNo - 2; i >= 0; i--) {
    const text = lines[i].trim();
    if (!text.startsWith('#')) break;
    const comment = text.replace(/^#+\s?/, '');
    // A commented-out variable (`# REDIS_URL=...`) ends the block: it and the
    // comments above it describe that variable, not this one.
    if (COMMENTED_OUT_RE.test(comment)) break;
    block.unshift(comment);
  }
  return block;
}

const COMMENTED_OUT_RE = /^(export\s+)?[A-Za-z_][A-Za-z0-9_]*=/;

function buildRule(entry, comments, errors, warnings) {
  /** @type {Rule} */
  const rule = {
    key: entry.key,
    line: entry.line,
    type: 'string',
    required: true,
    enum: null,
    pattern: null,
    patternFlags: '',
    min: null,
    max: null,
    secret: false,
    description: '',
    example: entry.value,
  };
  const description = [];

  for (const line of comments) {
    const at = firstAnnotationIndex(line);
    if (at === -1) {
      if (line.trim()) description.push(line.trim());
      continue;
    }
    const before = line.slice(0, at).trim();
    if (before) description.push(before);
    for (const tag of splitTags(line.slice(at))) {
      if (tag.name === 'desc' || tag.name === 'description') {
        if (tag.arg) description.push(tag.arg);
      } else {
        applyTag(rule, tag, errors, warnings);
      }
    }
  }

  rule.description = description.join(' ').trim();
  if (rule.enum && rule.type === 'string') rule.type = 'enum';
  if (rule.type === 'enum' && !rule.enum) {
    errors.push({ line: rule.line, message: `${rule.key}: @type enum needs the allowed values, e.g. "@enum a,b,c"` });
  }
  if (rule.min != null && rule.max != null && rule.min > rule.max) {
    errors.push({ line: rule.line, message: `${rule.key}: @min (${rule.min}) is greater than @max (${rule.max})` });
  }
  return rule;
}

/** Index of the first `@word` that starts the line or follows whitespace, else -1. */
function firstAnnotationIndex(line) {
  const match = /(^|\s)@[A-Za-z]/.exec(line);
  return match ? match.index + match[1].length : -1;
}

/**
 * Split "@type int @min 1 @max 10" into [{name:'type', arg:'int'}, ...].
 * Tags in REST_OF_LINE_TAGS swallow the remainder of the line, so a @pattern
 * may contain `@` characters.
 */
function splitTags(text) {
  const tags = [];
  let rest = text;
  for (;;) {
    const head = /^@([A-Za-z][\w-]*)/.exec(rest);
    if (!head) break;
    const name = head[1].toLowerCase();
    rest = rest.slice(head[0].length);
    if (REST_OF_LINE_TAGS.has(name)) {
      tags.push({ name, arg: rest.trim() });
      break;
    }
    const next = rest.search(/(^|\s)@[A-Za-z]/);
    const arg = (next === -1 ? rest : rest.slice(0, next)).trim();
    rest = next === -1 ? '' : rest.slice(next).trim();
    tags.push({ name, arg });
    if (!rest) break;
  }
  return tags;
}

function applyTag(rule, { name, arg }, errors, warnings) {
  const fail = (message) => errors.push({ line: rule.line, message: `${rule.key}: ${message}` });

  switch (name) {
    case 'type': {
      const [head, ...tail] = arg.toLowerCase().split(/\s+/);
      const type = TYPE_ALIASES[head] ?? head;
      if (!TYPES.includes(type)) {
        fail(`unknown @type "${arg}" (expected one of: ${TYPES.join(', ')})`);
        return;
      }
      rule.type = type;
      if (type === 'enum' && tail.length) rule.enum = splitList(tail.join(' '));
      return;
    }
    case 'enum':
    case 'values':
    case 'oneof': {
      const values = splitList(arg);
      if (!values.length) return fail(`@${name} needs a comma-separated list of values`);
      rule.enum = values;
      return;
    }
    case 'optional':
      rule.required = false;
      return;
    case 'required':
      rule.required = true;
      return;
    case 'secret':
    case 'sensitive':
      rule.secret = true;
      return;
    case 'pattern':
    case 'regex': {
      if (!arg) return fail(`@${name} needs a regular expression`);
      // Accept both a bare expression and the /expression/flags literal form.
      const literal = /^\/(.+)\/([a-z]*)$/s.exec(arg);
      const source = literal ? literal[1] : arg;
      const flags = literal ? literal[2] : '';
      try {
        new RegExp(source, flags);
      } catch (error) {
        return fail(`invalid @${name} ${arg}: ${error.message}`);
      }
      rule.pattern = source;
      rule.patternFlags = flags;
      return;
    }
    case 'min':
    case 'max': {
      const number = Number(arg);
      if (arg === '' || !Number.isFinite(number)) return fail(`@${name} needs a number, got "${arg}"`);
      rule[name] = number;
      return;
    }
    default:
      warnings.push({ line: rule.line, message: `${rule.key}: unknown annotation @${name} was ignored` });
  }
}

function splitList(text) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
