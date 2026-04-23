import { expect, test } from '@playwright/test';
import { requireEnv, signIn } from './helpers.js';

test('instructor starts and stops a timer from the dashboard', async ({ context, page }) => {
  await signIn(context, requireEnv('E2E_INSTRUCTOR_USER_ID'));

  await page.goto('/');
  await page.getByRole('button', { name: /start timer/i }).click();
  await expect(page.getByText(/running|elapsed|00:0/i).first()).toBeVisible();

  await page.getByRole('button', { name: /stop/i }).click();
  await expect(page.getByText(/not running/i)).toBeVisible();
});
