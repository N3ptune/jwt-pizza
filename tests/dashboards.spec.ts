import { test, expect } from './testSetup';
import { login, mockService } from './mockService';

test('diner dashboard with no orders', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');
  await page.getByRole('link', { name: 'KC' }).click();

  await expect(page.getByText('Your pizza kitchen')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Kai Chen');
  await expect(page.getByRole('main')).toContainText('d@jwt.com');
  await expect(page.getByRole('main')).toContainText('diner');
  await expect(page.getByText('How have you lived this long without having a pizza?')).toBeVisible();

  await page.getByRole('link', { name: 'Buy one' }).click();
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
});

test('diner dashboard shows order history', async ({ page }) => {
  const state = await mockService(page);
  state.orders.push({
    id: '42',
    franchiseId: '2',
    storeId: '4',
    date: '2024-06-05T05:14:40.000Z',
    items: [
      { menuId: '1', description: 'Veggie', price: 0.0038 },
      { menuId: '2', description: 'Pepperoni', price: 0.0042 },
    ],
  });
  await login(page, 'f@jwt.com', 'f');
  await page.getByRole('link', { name: 'FC' }).click();

  await expect(page.getByText('Here is your history of all the good times.')).toBeVisible();
  await expect(page.locator('tbody')).toContainText('42');
  await expect(page.locator('tbody')).toContainText('0.008 ₿');
  await expect(page.getByRole('main')).toContainText('Franchisee on 2');
});

test('franchise dashboard when not a franchisee', async ({ page }) => {
  await mockService(page);
  await page.getByRole('link', { name: 'Franchise' }).first().click();

  await expect(page.getByText('So you want a piece of the pie?')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('800-555-5555');
  await expect(page.getByText('Unleash Your Potential')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/franchise-dashboard\/login/);
});

test('franchisee creates and closes a store', async ({ page }) => {
  const state = await mockService(page);
  await login(page, 'f@jwt.com', 'f');
  await expect(page.getByRole('link', { name: 'FC' })).toBeVisible();
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();

  await expect(page.getByText('LotaPizza')).toBeVisible();
  await expect(page.locator('tbody')).toContainText('Lehi');
  await expect(page.locator('tbody')).toContainText('0.5 ₿');

  // Create a store, cancelling first
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('LotaPizza')).toBeVisible();

  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByPlaceholder('store name').fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('tbody')).toContainText('Provo');
  expect(state.franchises[0].stores.map((s) => s.name)).toContain('Provo');

  // Close a store
  await page.getByRole('row', { name: 'Lehi' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Lehi');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.locator('tbody')).not.toContainText('Lehi');
  expect(state.franchises[0].stores.map((s) => s.name)).not.toContain('Lehi');
});

test('admin dashboard not visible to diners', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

  await page.goto('/admin-dashboard');
  await expect(page.getByText('Oops')).toBeVisible();
});

test('admin manages franchises', async ({ page }) => {
  const state = await mockService(page);
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  await expect(page.getByRole('table')).toContainText('LotaPizza');
  await expect(page.getByRole('table')).toContainText('Fran Chise');
  await expect(page.getByRole('table')).toContainText('Spanish Fork');

  // Paging: 4 franchises at 3 per page
  await expect(page.getByRole('table')).not.toContainText('PizzaPocket');
  await page.getByRole('button', { name: '»' }).click();
  await expect(page.getByRole('table')).toContainText('PizzaPocket');
  await expect(page.getByRole('table')).not.toContainText('LotaPizza');
  await page.getByRole('button', { name: '«' }).click();
  await expect(page.getByRole('table')).toContainText('LotaPizza');

  // Filtering
  await page.getByPlaceholder('Filter franchises').fill('corp');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('table')).toContainText('PizzaCorp');
  await expect(page.getByRole('table')).not.toContainText('LotaPizza');

  // Create a franchise
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await expect(page.getByText('Want to create franchise?')).toBeVisible();
  await page.getByPlaceholder('franchise name').fill('NewPizza');
  await page.getByPlaceholder('franchisee admin email').fill('f@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  expect(state.franchises.find((f) => f.name === 'NewPizza')).toMatchObject({ admins: [{ email: 'f@jwt.com' }] });

  // Cancel creating a franchise
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();

  // Close a store
  await page.getByRole('row', { name: 'Spanish Fork' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('main')).toContainText('PizzaCorp');
  await expect(page.getByRole('main')).toContainText('Spanish Fork');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  expect(state.franchises.find((f) => f.name === 'PizzaCorp')!.stores).toHaveLength(0);

  // Close a franchise
  await page.getByRole('row', { name: 'LotaPizza' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('table')).not.toContainText('LotaPizza');
  expect(state.franchises.find((f) => f.name === 'LotaPizza')).toBeUndefined();
});
