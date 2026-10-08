/**
 * Renders a schema as a Markdown table and injects it into documentation
 * between `<!-- envguard:start -->` and `<!-- envguard:end -->` markers.
 */

export const START_MARKER = '<!-- envguard:start -->';
export const END_MARKER = '<!-- envguard:end -->';

/**
 * @param {import('./schema.js').Schema} schema
 * @returns {string} Markdown
 */
export function renderDocs(schema) {
  if (!schema.rules.length) return '_No environment variables declared._\n';

  const header = ['Variable', 'Required', 'Type', 'Example', 'Description'];
  const rows = schema.rules.map((rule) => [
    `\`${rule.key}\``,
    rule.required ? 'yes' : 'no',
    typeLabel(rule),
    exampleLabel(rule),
    escapeCell(rule.description),
  ]);

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Replace the block between the markers in `document` with `markdown`.
 * Returns `null` when the markers are not found.
 * @param {string} document
 * @param {string} markdown
 * @returns {string|null}
 */
export function injectDocs(document, markdown) {
  const start = document.indexOf(START_MARKER);
  const end = document.indexOf(END_MARKER, start + START_MARKER.length);
  if (start === -1 || end === -1) return null;
  const before = document.slice(0, start + START_MARKER.length);
  const after = document.slice(end);
  return `${before}\n${markdown.trimEnd()}\n${after}`;
}

function typeLabel(rule) {
  const parts = [];
  if (rule.type === 'enum') parts.push(`enum: ${(rule.enum ?? []).map((v) => `\`${v}\``).join(', ')}`);
  else parts.push(rule.type);

  const numeric = ['int', 'float', 'port'].includes(rule.type);
  if (rule.min != null || rule.max != null) {
    const unit = numeric ? '' : ' chars';
    if (rule.min != null && rule.max != null) parts.push(`${rule.min}–${rule.max}${unit}`);
    else if (rule.min != null) parts.push(`≥ ${rule.min}${unit}`);
    else parts.push(`≤ ${rule.max}${unit}`);
  }
  if (rule.pattern) parts.push(`matches \`/${escapeCell(rule.pattern)}/\``);
  return parts.join(', ');
}

function exampleLabel(rule) {
  if (rule.secret) return '_(secret)_';
  if (rule.example === '') return '';
  return `\`${escapeCell(rule.example)}\``;
}

function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
