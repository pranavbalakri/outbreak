import { expect, test } from '@playwright/test';
import { requireEnv, signIn } from './helpers.js';

test('admin creates a project', async ({ context, page }) => {
  await signIn(context, requireEnv('E2E_ADMIN_USER_ID'));

  await page.goto('/projects');
  await page.getByRole('button', { name: /new project/i }).click();

  const name = `E2E Project ${Date.now()}`;
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/estimated/i).fill('120');
  await page.getByRole('button', { name: /create/i }).click();

  await expect(page.getByText(name)).toBeVisible();
});
