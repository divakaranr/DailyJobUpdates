// Runs the API and web dev servers together: `pnpm dev`.
// On Windows the working directory's drive letter is normalised to upper case —
// Next.js otherwise loads modules twice ("c:\" vs "C:\") and fails with
// "invariant expected layout router to be mounted".
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd().replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const procs = [
  { name: 'api', color: '\x1b[36m', cwd: resolve(root, 'apps/api'), args: ['run', 'dev'] },
  { name: 'web', color: '\x1b[35m', cwd: resolve(root, 'apps/web'), args: ['run', 'dev'] },
];

const children = procs.map((p) => {
  const child = spawn('pnpm', p.args, { cwd: p.cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown();
  });
  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
