import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOTS = path.resolve(__dirname, '../test-screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

function trackConsole(page: Page, label: string) {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return {
    assertNoErrors() {
      const filtered = errors.filter((e) =>
        !/Failed to load resource.*manifest|favicon|sw\.js|robots\.txt/i.test(e)
      );
      if (filtered.length) {
        console.log(`\n[${label}] console errors:\n  ${filtered.join('\n  ')}\n`);
      }
      expect.soft(filtered, `console errors on ${label}`).toEqual([]);
    },
  };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.describe('Public auth pages', () => {
  test('login page renders + validates', async ({ page }) => {
    const t = trackConsole(page, 'login');
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'NUMLY' })).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await shot(page, 'login-empty');

    // Submit empty
    await page.getByRole('button', { name: /Sign in with Email/i }).click();
    // Should not navigate
    await expect(page).toHaveURL(/\/login$/);

    // Bad email
    await page.getByPlaceholder('you@example.com').fill('not-an-email');
    await page.getByPlaceholder('Enter your password').fill('whatever');
    await page.getByRole('button', { name: /Sign in with Email/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
    await shot(page, 'login-bad-email');

    t.assertNoErrors();
  });

  test('signup page renders + validates', async ({ page }) => {
    const t = trackConsole(page, 'signup');
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'NUMLY' })).toBeVisible();
    await shot(page, 'signup-empty');

    // Empty name (HTML5 will block; bypass by filling all then clearing)
    await page.getByPlaceholder('John Doe').fill('  ');
    await page.getByPlaceholder('you@example.com').fill('test@test.com');
    await page.getByPlaceholder('At least 8 characters').fill('password1');
    await page.getByPlaceholder('Re-enter your password').fill('password1');
    await page.getByRole('button', { name: /Create Account/i }).click();
    await expect(page.getByText(/please enter your full name/i)).toBeVisible();
    await shot(page, 'signup-empty-name');

    // Bad email
    await page.getByPlaceholder('John Doe').fill('Test User');
    await page.getByPlaceholder('you@example.com').fill('bad-email');
    await page.getByRole('button', { name: /Create Account/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();

    // Short password
    await page.getByPlaceholder('you@example.com').fill('test@test.com');
    await page.getByPlaceholder('At least 8 characters').fill('short');
    await page.getByPlaceholder('Re-enter your password').fill('short');
    await page.getByRole('button', { name: /Create Account/i }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
    await shot(page, 'signup-short-password');

    // Mismatch
    await page.getByPlaceholder('At least 8 characters').fill('password1');
    await page.getByPlaceholder('Re-enter your password').fill('password2');
    await page.getByRole('button', { name: /Create Account/i }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible();

    t.assertNoErrors();
  });

  test('forgot-password renders + validates', async ({ page }) => {
    const t = trackConsole(page, 'forgot');
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'NUMLY' }).first()).toBeVisible();
    await shot(page, 'forgot-empty');

    await page.getByPlaceholder('you@example.com').fill('not-an-email');
    await page.getByRole('button', { name: /Send Reset Link/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();

    t.assertNoErrors();
  });

  test('reset-password without recovery session shows invalid-link', async ({ page }) => {
    const t = trackConsole(page, 'reset');
    await page.goto('/reset-password');
    // Either "Verifying" then "Invalid", or directly "Invalid". Wait for either resolution.
    await expect(page.getByText(/Invalid or Expired Link|Verifying reset link/i)).toBeVisible();
    // Wait for final state
    await expect(page.getByRole('button', { name: /Request a new link/i })).toBeVisible({ timeout: 8_000 });
    await shot(page, 'reset-invalid');
    t.assertNoErrors();
  });
});

test.describe('Protected routes redirect to login', () => {
  const protectedPaths = [
    '/',
    '/businesses',
    '/business/abc/books',
    '/business/abc/books/xyz/ledgers',
    '/business/abc/books/xyz/ledgers/lll',
    '/business/abc/team',
    '/business/abc/audit',
  ];

  for (const p of protectedPaths) {
    test(`${p} → /login`, async ({ page }) => {
      const t = trackConsole(page, `protected ${p}`);
      await page.goto(p);
      await expect(page).toHaveURL(/\/login$/, { timeout: 6_000 });
      await shot(page, `protected${p.replace(/[^a-z0-9]+/gi, '_')}`);
      t.assertNoErrors();
    });
  }
});

test.describe('Misc', () => {
  test('unknown route redirects', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // Falls into catch-all (Navigate to /) → ProtectedRoute → /login
    await expect(page).toHaveURL(/\/login$/);
  });

  test('navigate from login to signup and back', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /Sign up/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await page.getByRole('link', { name: /Sign in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login → forgot-password link works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /Forgot password\?/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test('toast appears (using forgot-password validation as proxy)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByPlaceholder('you@example.com').fill('bad');
    await page.getByRole('button', { name: /Send Reset Link/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });
});
