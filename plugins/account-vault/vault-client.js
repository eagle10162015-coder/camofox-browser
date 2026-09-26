import { execFile, spawn } from 'node:child_process';
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

export async function vaultInput(args, payload) {
  const python = process.env.WRAITH_PYTHON || 'python';
  const env = { ...process.env };
  if (process.env.WRAITH_SRC) {
    env.PYTHONPATH = [process.env.WRAITH_SRC, env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'wraith.account_vault', ...args], {
      env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => reject(new Error('Vault unavailable')));
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('Vault operation failed')));
    child.stdin.end(JSON.stringify(payload));
  });
}
