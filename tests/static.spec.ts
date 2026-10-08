import { test, expect } from './testSetup';
import { mockService } from './mockService';

test('about page', async ({ page }) => {
  await mockService(page);
  await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click();

  await expect(page.getByText('The secret sauce')).toBeVisible();
  await expect(page.getByRole('main').getByRole('img').first()).toBeVisible();
});

test('history page', async ({ page }) => {
  await mockService(page);
  await page.getByRole('contentinfo').getByRole('link', { name: 'History' }).click();

  await expect(page.getByText('Mama Rucci, my my')).toBeVisible();
});

test('not found page', async ({ page }) => {
  await mockService(page);
  await page.goto('/this-page-does-not-exist');

  await expect(page.getByText('Oops')).toBeVisible();
  await page.getByRole('link', { name: 'home' }).click();
  await expect(page).toHaveURL('/');
});

test('service docs', async ({ page }) => {
  await mockService(page);
  await page.goto('/docs');

  await expect(page.getByText('JWT Pizza API')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('[POST] /api/order');
  await expect(page.getByRole('main')).toContainText('🔐');
});

test('factory docs', async ({ page }) => {
  await mockService(page);
  await page.goto('/docs/factory');

  await expect(page.getByRole('main')).toContainText('[POST] /api/order/verify');
  await expect(page.getByRole('main')).toContainText('Verify a pizza order');
});
