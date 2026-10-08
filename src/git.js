/**
 * Small helpers around the `git` binary. Everything here fails soft: when git
 * is not installed, the file is not inside a work tree, or git answers with
 * an error, we report "not in a repository" and the caller skips its
 * git-related checks rather than guessing.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Report whether `file` is tracked or ignored by the repository that
 * contains it. Git runs from the file's own directory, so a file outside the
 * current repository is judged by its own repository, or skipped when it is
 * not in one.
 *
 * @param {string} file  Path to the file, absolute or relative to `cwd`.
 * @param {string} cwd
 * @returns {{inRepo: boolean, tracked?: boolean, ignored?: boolean}}
 */
export function gitFileStatus(file, cwd) {
  const absolute = path.resolve(cwd, file);
  const dir = path.dirname(absolute);
  const name = path.basename(absolute);

  const inside = run(['rev-parse', '--is-inside-work-tree'], dir);
  if (inside?.status !== 0 || inside.stdout.trim() !== 'true') return { inRepo: false };

  // Both commands exit with 0 for "yes", 1 for "no" and anything else on error.
  const tracked = run(['ls-files', '--error-unmatch', '--', name], dir)?.status;
  const ignored = run(['check-ignore', '-q', '--', name], dir)?.status;
  if (![0, 1].includes(tracked) || ![0, 1].includes(ignored)) return { inRepo: false };

  return { inRepo: true, tracked: tracked === 0, ignored: ignored === 0 };
}

function run(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return result.error ? null : result;
}
