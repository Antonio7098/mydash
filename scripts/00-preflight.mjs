#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { access, lstat, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const MIN_NODE_MAJOR = 20;
const DEFAULT_PORT = 4173;
const REMOTE_CHECK_TIMEOUT_MS = 8_000;

/**
 * @typedef {'pass' | 'warn' | 'fail'} CheckStatus
 *
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {CheckStatus} status
 * @property {string} summary
 * @property {string[]} details
 */

function printHelp() {
  console.log(`My Dashboards bootstrap preflight

Usage:
  node scripts/00-preflight.mjs [options]

Options:
  --target <path>       Directory to inspect. Defaults to the current directory.
  --port <number>       Preview port to test. Defaults to ${DEFAULT_PORT}.
  --check-remote        Test whether the configured Git remote is reachable.
  --json                Print machine-readable JSON.
  --help                Show this help text.

Examples:
  node scripts/00-preflight.mjs
  node scripts/00-preflight.mjs --target ./my-dashboards --port 4173
  node scripts/00-preflight.mjs --check-remote --json
`);
}

function parseArgs(argv) {
  const options = {
    target: process.cwd(),
    port: DEFAULT_PORT,
    checkRemote: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      options.help = true;
      continue;
    }

    if (argument === '--json') {
      options.json = true;
      continue;
    }

    if (argument === '--check-remote') {
      options.checkRemote = true;
      continue;
    }

    if (argument === '--target' || argument.startsWith('--target=')) {
      const value = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : argv[++index];
      if (!value) {
        throw new Error('--target requires a path.');
      }
      options.target = path.resolve(value);
      continue;
    }

    if (argument === '--port' || argument.startsWith('--port=')) {
      const value = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : argv[++index];
      const port = Number.parseInt(value ?? '', 10);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('--port must be an integer between 1 and 65535.');
      }
      options.port = port;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  options.target = path.resolve(options.target);
  return options;
}

function makeResult(name, status, summary, details = []) {
  return { name, status, summary, details };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function runGit(target, args, options = {}) {
  return runCommand('git', ['-C', target, ...args], options);
}

async function checkTargetDirectory(target) {
  try {
    const stats = await lstat(target);
    if (!stats.isDirectory()) {
      return makeResult('Target directory', 'fail', `${target} exists but is not a directory.`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return makeResult('Target directory', 'fail', `${target} does not exist.`);
    }
    return makeResult('Target directory', 'fail', `Could not inspect ${target}.`, [String(error?.message ?? error)]);
  }

  try {
    await access(target, fsConstants.R_OK | fsConstants.W_OK);
    const temporaryDirectory = await mkdtemp(path.join(target, '.mydash-preflight-'));
    await rm(temporaryDirectory, { recursive: true, force: true });
    return makeResult('Target directory', 'pass', `Readable and writable: ${target}`);
  } catch (error) {
    return makeResult('Target directory', 'fail', `The target directory is not safely writable: ${target}`, [
      String(error?.message ?? error),
    ]);
  }
}

function checkNode() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    return makeResult(
      'Node.js',
      'fail',
      `Node.js ${process.versions.node} is installed, but version ${MIN_NODE_MAJOR} or later is required.`,
    );
  }
  return makeResult('Node.js', 'pass', `Node.js ${process.versions.node}`);
}

function checkExecutable(name, args) {
  const result = runCommand(name, args);
  if (result.ok) {
    return makeResult(name, 'pass', result.stdout || `${name} is available.`);
  }

  const detail = result.error?.code === 'ENOENT'
    ? `${name} was not found on PATH.`
    : result.stderr || result.error?.message || `${name} exited with status ${String(result.status)}.`;

  return makeResult(name, 'fail', `${name} is unavailable.`, [detail]);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(makeResult('Preview port', 'warn', `Port ${port} is already in use.`, [
          'Choose another port or stop the process currently using it before starting the preview server.',
        ]));
        return;
      }

      resolve(makeResult('Preview port', 'fail', `Port ${port} could not be tested.`, [String(error.message)]));
    });

    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => {
        resolve(makeResult('Preview port', 'pass', `Port ${port} is available on 127.0.0.1.`));
      });
    });
  });
}

async function detectGitOperation(gitDirectory) {
  const candidates = [
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
  ];

  for (const [marker, operation] of candidates) {
    try {
      await access(path.join(gitDirectory, marker));
      return operation;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

async function checkGitRepository(target, checkRemote) {
  /** @type {CheckResult[]} */
  const results = [];

  const repository = runGit(target, ['rev-parse', '--show-toplevel']);
  if (!repository.ok) {
    results.push(makeResult(
      'Git repository',
      'warn',
      'The target is not currently inside a Git repository.',
      ['The next bootstrap step can initialise one.'],
    ));
    return results;
  }

  const repositoryRoot = path.resolve(repository.stdout);
  results.push(makeResult('Git repository', 'pass', `Repository root: ${repositoryRoot}`));

  if (repositoryRoot !== target) {
    results.push(makeResult(
      'Repository location',
      'warn',
      'The target directory is inside an existing repository rather than at its root.',
      [`Target: ${target}`, `Repository root: ${repositoryRoot}`],
    ));
  } else {
    results.push(makeResult('Repository location', 'pass', 'The target directory is the repository root.'));
  }

  const gitDirectoryResult = runGit(target, ['rev-parse', '--absolute-git-dir']);
  if (gitDirectoryResult.ok) {
    try {
      const activeOperation = await detectGitOperation(path.resolve(gitDirectoryResult.stdout));
      if (activeOperation) {
        results.push(makeResult(
          'Git operation',
          'fail',
          `A Git ${activeOperation} operation is currently in progress.`,
          ['Complete or abort it manually before running bootstrap scripts.'],
        ));
      } else {
        results.push(makeResult('Git operation', 'pass', 'No merge, rebase, cherry-pick, revert or bisect is in progress.'));
      }
    } catch (error) {
      results.push(makeResult('Git operation', 'fail', 'Could not inspect the repository operation state.', [
        String(error?.message ?? error),
      ]));
    }
  }

  const branch = runGit(target, ['branch', '--show-current']);
  if (!branch.ok || !branch.stdout) {
    results.push(makeResult(
      'Git branch',
      'fail',
      'The repository is in a detached HEAD state or the current branch could not be determined.',
    ));
  } else {
    results.push(makeResult('Git branch', 'pass', `Current branch: ${branch.stdout}`));
  }

  const userName = runGit(target, ['config', '--get', 'user.name']);
  const userEmail = runGit(target, ['config', '--get', 'user.email']);
  const missingIdentity = [];
  if (!userName.ok || !userName.stdout) missingIdentity.push('user.name');
  if (!userEmail.ok || !userEmail.stdout) missingIdentity.push('user.email');

  if (missingIdentity.length > 0) {
    results.push(makeResult(
      'Git identity',
      'fail',
      `Git commit identity is incomplete: missing ${missingIdentity.join(' and ')}.`,
      [
        'Configure it before bootstrap scripts begin committing changes.',
        'Example: git config --global user.name "Your Name"',
        'Example: git config --global user.email "you@example.com"',
      ],
    ));
  } else {
    results.push(makeResult('Git identity', 'pass', `Configured as ${userName.stdout} <${userEmail.stdout}>.`));
  }

  const workingTree = runGit(target, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!workingTree.ok) {
    results.push(makeResult('Working tree', 'fail', 'Could not inspect the Git working tree.', [workingTree.stderr]));
  } else if (!workingTree.stdout) {
    results.push(makeResult('Working tree', 'pass', 'The working tree is clean.'));
  } else {
    const changedPaths = workingTree.stdout.split('\n').filter(Boolean);
    const preview = changedPaths.slice(0, 10);
    const hiddenCount = Math.max(0, changedPaths.length - preview.length);
    const details = [
      ...preview,
      ...(hiddenCount > 0 ? [`...and ${hiddenCount} more path(s).`] : []),
      'Later bootstrap scripts must preserve these changes and stage only files they own.',
    ];
    results.push(makeResult(
      'Working tree',
      'warn',
      `The working tree contains ${changedPaths.length} pre-existing change(s).`,
      details,
    ));
  }

  const remotes = runGit(target, ['remote']);
  const remoteNames = remotes.ok ? remotes.stdout.split('\n').filter(Boolean) : [];
  if (remoteNames.length === 0) {
    results.push(makeResult(
      'Git remote',
      'warn',
      'No Git remote is configured.',
      ['Bootstrap can still create local commits, but it will not be able to push them.'],
    ));
  } else {
    results.push(makeResult('Git remote', 'pass', `Configured remote(s): ${remoteNames.join(', ')}`));
  }

  const upstream = runGit(target, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (!upstream.ok || !upstream.stdout) {
    results.push(makeResult(
      'Git upstream',
      'warn',
      'The current branch has no upstream branch.',
      ['The first safe push may need to establish one explicitly.'],
    ));
  } else {
    results.push(makeResult('Git upstream', 'pass', `Upstream branch: ${upstream.stdout}`));
  }

  if (checkRemote && remoteNames.length > 0) {
    let remoteToCheck = remoteNames[0];
    if (branch.ok && branch.stdout) {
      const configuredRemote = runGit(target, ['config', '--get', `branch.${branch.stdout}.remote`]);
      if (configuredRemote.ok && configuredRemote.stdout && configuredRemote.stdout !== '.') {
        remoteToCheck = configuredRemote.stdout;
      }
    }

    const remoteCheck = runGit(
      target,
      ['ls-remote', '--heads', remoteToCheck],
      { timeoutMs: REMOTE_CHECK_TIMEOUT_MS },
    );

    if (remoteCheck.ok) {
      results.push(makeResult('Remote reachability', 'pass', `Remote ${remoteToCheck} is reachable.`));
    } else if (remoteCheck.timedOut) {
      results.push(makeResult(
        'Remote reachability',
        'warn',
        `Remote ${remoteToCheck} did not respond within ${REMOTE_CHECK_TIMEOUT_MS / 1000} seconds.`,
      ));
    } else {
      results.push(makeResult(
        'Remote reachability',
        'warn',
        `Remote ${remoteToCheck} could not be reached or authenticated.`,
        [remoteCheck.stderr || remoteCheck.error?.message || 'git ls-remote failed.'],
      ));
    }
  }

  return results;
}

function printHumanReport(report) {
  console.log('My Dashboards bootstrap preflight');
  console.log(`Target: ${report.target}`);
  console.log(`Preview port: ${report.port}`);
  console.log('');

  const width = Math.max(...report.checks.map((check) => check.name.length), 12);
  for (const check of report.checks) {
    console.log(`${check.status.toUpperCase().padEnd(5)}  ${check.name.padEnd(width)}  ${check.summary}`);
    for (const detail of check.details) {
      console.log(`${' '.repeat(8 + width)}  - ${detail}`);
    }
  }

  console.log('');
  console.log(
    `Summary: ${report.summary.pass} passed, ${report.summary.warn} warning(s), ${report.summary.fail} failure(s).`,
  );
  console.log('No project files were changed.');

  if (!report.ok) {
    console.log('Resolve the failures before running the next bootstrap script.');
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Argument error: ${String(error?.message ?? error)}`);
    console.error('Run with --help for usage.');
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  /** @type {CheckResult[]} */
  const checks = [];
  checks.push(checkNode());

  const npmCheck = checkExecutable('npm', ['--version']);
  npmCheck.summary = npmCheck.status === 'pass' ? `npm ${npmCheck.summary}` : npmCheck.summary;
  checks.push(npmCheck);

  const gitCheck = checkExecutable('git', ['--version']);
  checks.push(gitCheck);

  checks.push(await checkTargetDirectory(options.target));
  checks.push(await checkPort(options.port));

  if (gitCheck.status === 'pass') {
    checks.push(...await checkGitRepository(options.target, options.checkRemote));
  }

  const summary = checks.reduce(
    (counts, check) => {
      counts[check.status] += 1;
      return counts;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  const report = {
    ok: summary.fail === 0,
    generatedAt: new Date().toISOString(),
    target: options.target,
    port: options.port,
    remoteChecked: options.checkRemote,
    summary,
    checks,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

await main();
