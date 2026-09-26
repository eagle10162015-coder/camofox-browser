# Shared account vault

This fork adds an `account-vault` plugin. It lists account labels for the exact
origin of a live tab and fills a selected username or password field directly.
Account lookup and fill responses do not contain passwords. Agents with access
to arbitrary page evaluation can inspect values already entered into a page.

Install the Wraith fork in the same environment and import one or more Google
Password Manager CSV files:

```powershell
python -m wraith.account_vault import-google C:\path\to\passwords.csv --source personal-google
```

Set `WRAITH_PYTHON` when Python is not on PATH. The plugin provides
`GET /accounts?userId=...&tabId=...` and
`POST /tabs/:tabId/fill-account`. The MCP adapter provides
`camofox_accounts_for_tab` and `camofox_fill_account`.
`camofox_autofill_account` fills common login forms without a screenshot, and
`camofox_save_account` records a new or rotated password. Supply the existing
account ID when rotating a password imported from Google.

The MCP adapter now defaults to the stable user ID `personal`, allowing the
persistence plugin to find the same profile after a restart. Override it with
`CAMOFOX_USER_ID` to isolate another account. MCP snapshots omit screenshots
by default.

`camofox.config.json` uses `interactive.mode=desktop` in this fork, so the
same Camoufox window is visible and usable by a person on the Windows desktop.
The persistence plugin also checkpoints IndexedDB with cookies and localStorage
for sites that keep session material there.
It checkpoints after navigation and every 30 seconds while a session is active,
which reduces loss from an abrupt browser exit. An isolated session value was
verified to survive a forced server restart on Windows.

The upstream MIT license and copyright notice remain in `LICENSE`.

`camofox_fingerprint_health` checks a few local browser signals in a live tab
without a screenshot. Its result is diagnostic and cannot guarantee acceptance
by a site.
