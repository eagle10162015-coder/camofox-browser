import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function vaultCommand(args) {
  const python = process.env.WRAITH_PYTHON || 'python';
  const env = { ...process.env };
  if (process.env.WRAITH_SRC) {
    env.PYTHONPATH = [process.env.WRAITH_SRC, env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
  }
  const { stdout } = await run(python, ['-m', 'wraith.account_vault', ...args], {
    env,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}
