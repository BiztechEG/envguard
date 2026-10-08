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
 *
 * Each marker must sit on its own line. Markers inside fenced code blocks
 * are ignored, so a README can show the markers as an example and still
 * have a real block further down.
 *
 * Returns `null` when the markers are not found.
 * @param {string} document
 * @param {string} markdown
 * @returns {string|null}
 */
export function injectDocs(document, markdown) {
  const markers = findMarkers(document);
  if (!markers) return null;
  const before = document.slice(0, markers.start + START_MARKER.length);
  const after = document.slice(markers.end);
  return `${before}\n${markdown.trimEnd()}\n${after}`;
}

/**
 * Offsets of the first start marker and the end marker that follows it,
 * skipping fenced code blocks. Returns null when either is missing.
 * @param {string} document
 * @returns {{start: number, end: number}|null}
 */
function findMarkers(document) {
  let offset = 0;
  let fence = null;
  let start = -1;
  for (const line of document.split('\n')) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const run = fenceMatch[1];
      if (fence === null) fence = run;
      else if (run[0] === fence[0] && run.length >= fence.length) fence = null;
    } else if (fence === null) {
      const text = line.trim();
      if (start === -1 && text === START_MARKER) {
        start = offset + line.indexOf(START_MARKER);
      } else if (start !== -1 && text === END_MARKER) {
        return { start, end: offset + line.indexOf(END_MARKER) };
      }
    }
    offset += line.length + 1;
  }
  return null;
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
  if (rule.pattern) parts.push(`matches \`/${escapeCell(rule.pattern)}/${rule.patternFlags ?? ''}\``);
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
