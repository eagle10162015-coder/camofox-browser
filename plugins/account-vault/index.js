/** Import account metadata and fill credentials without returning passwords to agents. */
import { vaultCommand } from './vault-client.js';

function currentTab(sessions, normalizeUserId, userId, tabId) {
  const session = sessions.get(normalizeUserId(userId));
  if (!session) return null;
  for (const group of session.tabGroups.values()) {
    const tab = group.get(tabId);
    if (tab?.page) return tab;
  }
  return null;
}

export async function register(app, ctx) {
  const { sessions, normalizeUserId } = ctx;

  app.get('/accounts', ctx.auth(), async (req, res) => {
    const { userId, tabId } = req.query;
    const tab = currentTab(sessions, normalizeUserId, userId, tabId);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    try {
      const accounts = JSON.parse(await vaultCommand(['list', tab.page.url()]));
      return res.json({ origin: new URL(tab.page.url()).origin, accounts });
    } catch {
      return res.status(503).json({ error: 'Account vault unavailable' });
    }
  });

  app.post('/tabs/:tabId/fill-account', ctx.auth(), async (req, res) => {
    const { userId, accountId, fieldKind, selector } = req.body || {};
    if (!userId || !accountId || !selector || !['username', 'password'].includes(fieldKind)) {
      return res.status(400).json({ error: 'userId, accountId, selector and valid fieldKind are required' });
    }
    const tab = currentTab(sessions, normalizeUserId, userId, req.params.tabId);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    const page = tab.page;
    const initialOrigin = new URL(page.url()).origin;
    try {
      const locator = page.locator(selector).first();
      const metadata = await locator.evaluate(el => ({
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute('type') || '').toLowerCase(),
      }));
      if (!['input', 'textarea'].includes(metadata.tag)) {
        return res.status(400).json({ error: 'Target must be an input field' });
      }
      if (fieldKind === 'password' && metadata.type !== 'password') {
        return res.status(400).json({ error: 'Target must be a password field' });
      }
      if (fieldKind === 'username' && metadata.type === 'password') {
        return res.status(400).json({ error: 'Target must be a username field' });
      }
      const secret = await vaultCommand(['_browser_reveal', accountId, fieldKind, initialOrigin]);
      if (new URL(page.url()).origin !== initialOrigin) {
        return res.status(409).json({ error: 'Page origin changed' });
      }
      await locator.fill(secret);
      return res.json({ ok: true, origin: initialOrigin, fieldKind });
    } catch {
      return res.status(503).json({ error: 'Account fill failed' });
    }
  });

  app.post('/tabs/:tabId/autofill-account', ctx.auth(), async (req, res) => {
    const { userId, accountId, submit = false } = req.body || {};
    if (!userId || !accountId) return res.status(400).json({ error: 'userId and accountId are required' });
    const tab = currentTab(sessions, normalizeUserId, userId, req.params.tabId);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    const page = tab.page;
    const origin = new URL(page.url()).origin;
    const filled = { username: false, password: false };
    try {
      const userSelectors = [
        'input[autocomplete="username"]', 'input[type="email"]',
        'input[name="username"]', 'input[name="email"]',
        'input[id="username"]', 'input[id="email"]', '#identifierId',
      ];
      for (const selector of userSelectors) {
        const field = page.locator(selector).first();
        if (await field.count() && await field.isVisible()) {
          const value = await vaultCommand(['_browser_reveal', accountId, 'username', origin]);
          if (new URL(page.url()).origin !== origin) return res.status(409).json({ error: 'Page origin changed' });
          await field.fill(value);
          filled.username = true;
          break;
        }
      }
      const password = page.locator('input[type="password"]').first();
      if (await password.count() && await password.isVisible()) {
        const value = await vaultCommand(['_browser_reveal', accountId, 'password', origin]);
        if (new URL(page.url()).origin !== origin) return res.status(409).json({ error: 'Page origin changed' });
        await password.fill(value);
        filled.password = true;
      }
      let submitted = false;
      if (submit && (filled.username || filled.password)) {
        const button = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await button.count() && await button.isVisible()) {
          await button.click();
          submitted = true;
        }
      }
      return res.json({ ok: true, origin, filled, submitted });
    } catch {
      return res.status(503).json({ error: 'Account autofill failed' });
    }
  });
}
