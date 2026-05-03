import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOTS = path.resolve(__dirname, '../test-screenshots/auth');
fs.mkdirSync(SHOTS, { recursive: true });

const EMAIL = 'testron@n.a';
const PASSWORD = 'asdfghjkl';

const consoleErrors: Record<string, string[]> = {};
let currentLabel = 'init';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

function attachConsole(page: Page) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      (consoleErrors[currentLabel] ??= []).push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    (consoleErrors[currentLabel] ??= []).push(`pageerror: ${err.message}`);
  });
  page.on('response', async (resp) => {
    if (resp.status() >= 400 && /supabase\.co/.test(resp.url())) {
      let body = '';
      try { body = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
      (consoleErrors[currentLabel] ??= []).push(`HTTP ${resp.status()} ${resp.url().split('?')[0]} ${body}`);
    }
  });
}

async function setLabel(label: string) {
  currentLabel = label;
}

async function login(page: Page) {
  await setLabel('login');
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign in with Email/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test('full auth-walkthrough', async ({ page }) => {
  test.setTimeout(180_000);
  attachConsole(page);

  // 1. Login
  await login(page);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await shot(page, '01-after-login');

  // 2. Onboarding (root)
  await setLabel('onboarding');
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await shot(page, '02-onboarding');

  // 3. Create a business — only if we're still on onboarding
  let businessId: string | null = null;
  if (page.url().endsWith('/') || page.url().endsWith('/businesses') === false) {
    await setLabel('create-business');
    const createCard = page.getByRole('button', { name: /Create Business/i }).first();
    if (await createCard.count() > 0) {
      await createCard.click();
      await page.getByPlaceholder(/My Store|Gold Trading/i).fill(`Playwright Co ${Date.now() % 1_000_000}`);
      await shot(page, '03-create-form');
      await page.getByRole('button', { name: /Create Business/i }).last().click();
      await page.waitForURL(/\/business\/[^/]+\/books$/, { timeout: 15_000 });
      const m = page.url().match(/\/business\/([^/]+)\/books/);
      if (m) businessId = m[1];
    }
  }
  console.log('businessId after create:', businessId);

  // If still no business (e.g., user redirected straight to /businesses from
  // having existing ones), navigate there and click into the first.
  if (!businessId) {
    await setLabel('businesses');
    await page.goto('/businesses');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    // Wait for hydration / spaces to appear
    await page.waitForTimeout(2_000);

    // Click the business name text in the first card.
    const nameText = page.getByText(/^PLAYWRIGHT CO/i).first();
    if (await nameText.count() > 0) {
      await nameText.click().catch(() => {});
    }
    await page.waitForURL(/\/business\/[0-9a-f-]+/, { timeout: 8_000 }).catch(() => {});
    const m = page.url().match(/\/business\/([0-9a-f-]+)/);
    if (m) businessId = m[1];
    await shot(page, '04-businesses');
  } else {
    await setLabel('businesses');
    await page.goto('/businesses');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await shot(page, '04-businesses');
  }

  expect(businessId, 'expected to have a business by now').toBeTruthy();

  // 4. Books list (we should already be there or navigate)
  await setLabel('books');
  await page.goto(`/business/${businessId}/books`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await shot(page, '05-books');

  // 5. Create a book (look for "Create" / "+" trigger). Handle modal if present.
  await setLabel('create-book');
  const createBookBtn = page.locator('button').filter({ hasText: /create|new|add/i }).first();
  if (await createBookBtn.count() > 0) {
    await createBookBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    const modalInput = page.locator('input[type="text"]:visible').first();
    if (await modalInput.count() > 0) {
      await modalInput.fill('Test Book');
      await shot(page, '06-create-book-modal');
      const submit = page.getByRole('button', { name: /create|save/i }).last();
      if (await submit.count() > 0) await submit.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    }
  }
  await shot(page, '07-after-create-book');

  // 6. Click into the first book if any
  await setLabel('ledgers');
  const bookLink = page.locator(`a[href^="/business/${businessId}/books/"]`).first();
  if (await bookLink.count() > 0) {
    await bookLink.click();
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await shot(page, '08-ledgers');
  }

  // 7. Team page (give the local-first sync engine a moment to flush)
  await page.waitForTimeout(1500);
  await setLabel('team');
  await page.goto(`/business/${businessId}/team`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await shot(page, '09-team');

  // 8. Audit page
  await setLabel('audit');
  await page.goto(`/business/${businessId}/audit`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await shot(page, '10-audit');

  // 9. Sign out
  await setLabel('signout');
  await page.goto(`/business/${businessId}/books`);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  const signOutBtn = page.getByRole('button', { name: /sign out/i }).first();
  await expect(signOutBtn).toBeVisible({ timeout: 5_000 });
  await signOutBtn.click();
  await page.waitForURL(/\/login$/, { timeout: 8_000 });
  await shot(page, '11-after-signout');
});

test.afterAll(() => {
  console.log('\n=== Errors per page ===');
  for (const [k, v] of Object.entries(consoleErrors)) {
    if (v.length) {
      console.log(`\n[${k}] ${v.length} error(s):`);
      v.slice(0, 10).forEach((e) => console.log('  - ' + e));
    }
  }
});
