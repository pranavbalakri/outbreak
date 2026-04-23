import { expect, test } from '@playwright/test';
import { requireEnv, signIn } from './helpers.js';

test('admin opens the monthly report', async ({ context, page }) => {
  await signIn(context, requireEnv('E2E_ADMIN_USER_ID'));

  await page.goto('/reports');
  await page.getByRole('tab', { name: /1-?month/i }).click();
  await expect(page.getByText(/total/i).first()).toBeVisible();
});
