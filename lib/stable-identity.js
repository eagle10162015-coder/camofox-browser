import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PREFIX = 'CAMOU_CONFIG_';

function identityPath(profileDir) {
  return path.join(profileDir, 'browser-identity.json');
}

function binaryVersion(executablePath) {
  try {
    const installDir = process.env.CAMOUFOX_INSTALL_DIR || (executablePath && path.dirname(executablePath));
    if (!installDir) return null;
    return JSON.parse(fs.readFileSync(path.join(installDir, 'version.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function loadStableIdentity(profileDir, executablePath) {
  try {
    const saved = JSON.parse(fs.readFileSync(identityPath(profileDir), 'utf8'));
    if (JSON.stringify(saved.binaryVersion) !== JSON.stringify(binaryVersion(executablePath))) return null;
    if (!saved.config || typeof saved.config !== 'object' || Array.isArray(saved.config)) return null;
    return saved.config;
  } catch {
    return null;
  }
}

export function saveStableIdentity(profileDir, executablePath, environment) {
  const chunks = Object.entries(environment)
    .filter(([key]) => /^CAMOU_CONFIG_[1-9][0-9]*$/.test(key))
    .sort(([a], [b]) => Number(a.slice(CONFIG_PREFIX.length)) - Number(b.slice(CONFIG_PREFIX.length)))
    .map(([, value]) => value);
  if (!chunks.length) throw new Error('Camoufox launch did not provide fingerprint config');
  const config = JSON.parse(chunks.join(''));
  const target = identityPath(profileDir);
  fs.mkdirSync(profileDir, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ binaryVersion: binaryVersion(executablePath), config }));
  fs.renameSync(temporary, target);
}
