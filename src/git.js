/**
 * Small helpers around the `git` binary. Everything here fails soft: when git
 * is not installed or the directory is not a repository, we simply report that
 * and the caller skips its git-related checks.
 */

import { spawnSync } from 'node:child_process';

/**
 * @param {string} file  Path relative to `cwd`.
 * @param {string} cwd
 * @returns {{inRepo: boolean, tracked?: boolean, ignored?: boolean}}
 */
export function gitFileStatus(file, cwd) {
  const inside = run(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside === null || inside.status !== 0) return { inRepo: false };

  const tracked = run(['ls-files', '--error-unmatch', '--', file], cwd)?.status === 0;
  const ignored = run(['check-ignore', '-q', '--', file], cwd)?.status === 0;
  return { inRepo: true, tracked, ignored };
}

function run(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return result.error ? null : result;
}
