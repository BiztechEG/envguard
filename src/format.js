/**
 * Terminal output helpers: colours that respect NO_COLOR / FORCE_COLOR / TTY,
 * and the human-readable rendering of a check report.
 */

/**
 * @param {{isTTY?: boolean}} stream
 * @param {Record<string, string|undefined>} env
 * @param {boolean} [disabled]
 */
export function makePalette(stream, env, disabled = false) {
  const enabled = !disabled && colorsSupported(stream, env);
  const wrap = (open, close) => (text) => (enabled ? `\u001b[${open}m${text}\u001b[${close}m` : String(text));
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}

function colorsSupported(stream, env) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
  if (env.TERM === 'dumb') return false;
  return Boolean(stream && stream.isTTY);
}

/**
 * @param {import('./check.js').Report} report
 * @param {object} options
 * @param {ReturnType<typeof makePalette>} options.c
 * @param {string} options.envLabel      Display name of the env source.
 * @param {string} options.exampleLabel  Display name of the example file.
 * @returns {string}
 */
export function formatReport(report, { c, envLabel, exampleLabel }) {
  const lines = [];
  const { errors, warnings, variables } = report.summary;
  const vars = `${variables} variable${variables === 1 ? '' : 's'}`;

  if (report.problems.length === 0) {
    lines.push(`${c.green('✔')} ${c.bold(envLabel)} matches ${c.bold(exampleLabel)} ${c.dim(`(${vars})`)}`);
    return `${lines.join('\n')}\n`;
  }

  lines.push(`${c.bold(envLabel)} ${c.dim('←')} ${c.bold(exampleLabel)}`, '');
  const width = Math.min(32, Math.max(0, ...report.problems.map((p) => (p.key ?? '').length)));
  for (const problem of report.problems) {
    const icon = problem.level === 'error' ? c.red('✖') : c.yellow('⚠');
    const key = problem.key ? c.bold(problem.key.padEnd(width)) : ''.padEnd(width);
    const where = location(problem, envLabel, exampleLabel);
    lines.push(`  ${icon}  ${key}  ${problem.message}${where ? `  ${c.dim(where)}` : ''}`);
  }
  lines.push('');

  const counts = [];
  if (errors) counts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  if (warnings) counts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  const icon = errors ? c.red('✖') : c.yellow('⚠');
  const summary = errors ? c.red(counts.join(', ')) : c.yellow(counts.join(', '));
  lines.push(`${icon} ${summary} ${c.dim(`(${vars})`)}`);
  return `${lines.join('\n')}\n`;
}

function location(problem, envLabel, exampleLabel) {
  if (problem.line == null || !problem.file) return '';
  const file = problem.file === 'example' ? exampleLabel : envLabel;
  return `${file}:${problem.line}`;
}
