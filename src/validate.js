/**
 * Validates a single value against a schema rule.
 * Returns `null` when the value is fine, otherwise a human-readable message.
 * Secret values are never echoed back.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INT_RE = /^[+-]?\d+$/;
const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const BOOL_RE = /^(true|false|1|0|yes|no|on|off)$/i;

/**
 * @param {string} value
 * @param {import('./schema.js').Rule} rule
 * @returns {string|null}
 */
export function validateValue(value, rule) {
  const shown = rule.secret ? '(hidden)' : `"${truncate(value)}"`;
  /** @type {number|null} */
  let number = null;

  switch (rule.type) {
    case 'string':
      break;
    case 'int':
      if (!INT_RE.test(value)) return `expected an integer, got ${shown}`;
      number = Number(value);
      break;
    case 'float':
      if (!FLOAT_RE.test(value)) return `expected a number, got ${shown}`;
      number = Number(value);
      break;
    case 'bool':
      if (!BOOL_RE.test(value)) return `expected a boolean (true/false, 1/0, yes/no, on/off), got ${shown}`;
      break;
    case 'url':
      if (!isUrl(value)) return `expected a URL like https://example.com, got ${shown}`;
      break;
    case 'email':
      if (!EMAIL_RE.test(value)) return `expected an email address, got ${shown}`;
      break;
    case 'port':
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        return `expected a port number (1-65535), got ${shown}`;
      }
      number = Number(value);
      break;
    case 'json':
      try {
        JSON.parse(value);
      } catch (error) {
        return `expected valid JSON (${error.message})`;
      }
      break;
    case 'uuid':
      if (!UUID_RE.test(value)) return `expected a UUID, got ${shown}`;
      break;
    case 'enum':
      if (!rule.enum || !rule.enum.includes(value)) {
        return `expected one of ${(rule.enum ?? []).join(', ')}, got ${shown}`;
      }
      break;
    default:
      return `unknown type "${rule.type}"`;
  }

  if (rule.pattern != null && !new RegExp(rule.pattern, rule.patternFlags ?? '').test(value)) {
    return `does not match pattern /${rule.pattern}/${rule.patternFlags ?? ''}`;
  }

  if (rule.min != null || rule.max != null) {
    if (number != null) {
      if (rule.min != null && number < rule.min) return `must be at least ${rule.min}, got ${number}`;
      if (rule.max != null && number > rule.max) return `must be at most ${rule.max}, got ${number}`;
    } else {
      const length = value.length;
      if (rule.min != null && length < rule.min) return `must be at least ${rule.min} characters long, got ${length}`;
      if (rule.max != null && length > rule.max) return `must be at most ${rule.max} characters long, got ${length}`;
    }
  }

  return null;
}

// A scheme followed by "//". Without this check `new URL()` happily accepts
// values like "localhost:3000", treating "localhost:" as the scheme.
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function isUrl(value) {
  if (/\s/.test(value) || !URL_SCHEME_RE.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
