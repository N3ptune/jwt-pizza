import { test, expect } from './testSetup';
import { login, mockService } from './mockService';

test('home page', async ({ page }) => {
  await mockService(page);

  expect(await page.title()).toBe('JWT Pizza');
  await expect(page.getByRole('heading', { name: 'The web\'s best pizza' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
});

test('login', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login' })).toHaveCount(0);
});

test('login with bad password shows error', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'wrong');

  await expect(page.getByText('unknown user')).toBeVisible();
  await expect(page.getByRole('link', { name: 'KC' })).toHaveCount(0);
});

test('logout', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();

  await page.getByRole('link', { name: 'Logout' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'KC' })).toHaveCount(0);
});

test('register', async ({ page }) => {
  await mockService(page);
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByText('Welcome to the party')).toBeVisible();

  await page.getByRole('textbox', { name: 'Full name' }).fill('Pizza Lover');
  await page.getByRole('textbox', { name: 'Email address' }).fill('p@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('pw');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByRole('link', { name: 'PL' })).toBeVisible();
});

test('register failure shows error', async ({ page }) => {
  await mockService(page);
  await page.route('*/**/api/auth', async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 400, json: { message: 'name, email, and password are required' } });
  });
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('Pizza Lover');
  await page.getByRole('textbox', { name: 'Email address' }).fill('p@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('pw');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByText('name, email, and password are required')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});

test('switch between login and register', async ({ page }) => {
  await mockService(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByText('Register', { exact: true }).last().click();
  await expect(page.getByText('Welcome to the party')).toBeVisible();

  await page.locator('form').getByText('Login', { exact: true }).click();
  await expect(page.getByText('Welcome back')).toBeVisible();
});

test('purchase with login', async ({ page }) => {
  const state = await mockService(page);

  await page.getByRole('button', { name: 'Order now' }).click();

  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('2 pies');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('Here is your JWT Pizza!')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('23');
  await expect(page.getByText('0.008')).toBeVisible();
  expect(state.orders).toHaveLength(1);
  expect(state.orders[0]).toMatchObject({ storeId: '4', franchiseId: '2' });

  // Verify the JWT with the factory
  await page.getByRole('button', { name: 'Verify' }).click();
  const modal = page.locator('#hs-jwt-modal');
  await expect(modal.locator('h3')).toContainText('valid');
  await expect(modal.locator('pre')).toContainText('"name": "BYU"');
  await expect(modal).toHaveClass(/open/);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).not.toHaveClass(/open/);

  // Order more takes you back to the menu
  await page.getByRole('button', { name: 'Order more' }).click();
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
});

test('single pizza purchase then cancel returns to menu', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();

  await page.getByRole('link', { name: 'Order' }).click();
  await page.getByRole('combobox').selectOption('7');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();

  await expect(page.getByText('Send me that pizza right now!')).toBeVisible();
  await expect(page.locator('tfoot')).toContainText('1 pie');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Selected pizzas: 1')).toBeVisible();
});

test('verify invalid pizza on delivery', async ({ page }) => {
  await mockService(page);
  await page.goto('/delivery');

  await page.getByRole('button', { name: 'Verify' }).click();
  const modal = page.locator('#hs-jwt-modal');
  await expect(modal.locator('h3')).toContainText('invalid');
  await expect(modal.locator('pre')).toContainText('Looks like you have a bad pizza');
});

test('payment failure shows error', async ({ page }) => {
  await mockService(page);
  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ status: 500, json: { message: 'Failed to fulfill order at factory' } });
  });
  await login(page, 'd@jwt.com', 'a');
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();

  await page.getByRole('link', { name: 'Order' }).click();
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('Failed to fulfill order at factory')).toBeVisible();
});
