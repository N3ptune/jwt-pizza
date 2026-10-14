import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { login, mockService } from './mockService';
import { Role } from '../src/service/pizzaService';

async function registerDiner(page: Page) {
  const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('link', { name: 'pd' })).toBeVisible();
  return email;
}

async function logout(page: Page) {
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
}

async function submitEditUser(page: Page, fields: { name?: string; email?: string; password?: string }) {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  if (fields.name !== undefined) await page.getByLabel('name', { exact: true }).fill(fields.name);
  if (fields.email !== undefined) await page.getByLabel('email', { exact: true }).fill(fields.email);
  if (fields.password !== undefined) await page.getByLabel('password', { exact: true }).fill(fields.password);
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });
}

test('updateUser', async ({ page }) => {
  await mockService(page);
  const email = await registerDiner(page);

  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza diner');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  await page.getByRole('textbox').first().fill('pizza dinerx');
  await page.getByRole('button', { name: 'Update' }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('pizza dinerx');

  // The change must survive logging out and back in.
  await logout(page);
  await login(page, email, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('update email and password', async ({ page }) => {
  await mockService(page);
  const email = await registerDiner(page);
  const newEmail = `x${email}`;

  await page.getByRole('link', { name: 'pd' }).click();
  await submitEditUser(page, { email: newEmail, password: 'newpass' });
  await expect(page.getByRole('main')).toContainText(newEmail);

  // The old credentials no longer work.
  await logout(page);
  await login(page, email, 'diner');
  await expect(page.getByText('unknown user')).toBeVisible();

  await page.getByRole('textbox', { name: 'Email address' }).fill(newEmail);
  await page.getByRole('textbox', { name: 'Password' }).fill('newpass');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText(newEmail);
  await expect(page.getByRole('main')).toContainText('pizza diner');
});

test('cancel edit user leaves user unchanged', async ({ page }) => {
  await mockService(page);
  await login(page, 'd@jwt.com', 'a');
  await page.getByRole('link', { name: 'KC' }).click();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('name', { exact: true }).fill('Somebody Else');
  // Preline ignores a close request until the open transition has finished.
  await expect(page.locator('#hs-jwt-modal')).toHaveClass(/opened/);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#hs-jwt-modal')).toBeHidden();

  await expect(page.getByRole('main')).toContainText('Kai Chen');
});

test('franchisee updates name and keeps roles', async ({ page }) => {
  const state = await mockService(page);
  await login(page, 'f@jwt.com', 'f');
  await page.getByRole('link', { name: 'FC' }).click();

  await submitEditUser(page, { name: 'Fran Chisey' });
  await expect(page.getByRole('main')).toContainText('Fran Chisey');
  await expect(page.getByRole('main')).toContainText('Franchisee on 2');
  expect(state.users['f@jwt.com'].name).toBe('Fran Chisey');
});

test('admin updates own name', async ({ page }) => {
  await mockService(page);
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'A', exact: true }).click();

  await submitEditUser(page, { name: 'Admin Prime' });
  await expect(page.getByRole('main')).toContainText('Admin Prime');
  await expect(page.getByRole('main')).toContainText('admin');
});

test('admin lists users', async ({ page }) => {
  await mockService(page);
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const kai = page.getByRole('row', { name: /Kai Chen/ });
  await expect(kai).toContainText('d@jwt.com');
  await expect(kai).toContainText('diner');
  await expect(page.getByRole('row', { name: /f@jwt.com/ })).toContainText('franchisee');
  await expect(page.getByRole('row', { name: /a@jwt.com/ })).toContainText('admin');
});

test('admin filters users by name', async ({ page }) => {
  await mockService(page);
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toBeVisible();

  await page.getByPlaceholder('Filter users').fill('fran');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('row', { name: /f@jwt.com/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toHaveCount(0);

  await page.getByPlaceholder('Filter users').fill('');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toBeVisible();
});

test('admin pages through users', async ({ page }) => {
  const state = await mockService(page);
  for (let i = 10; i < 22; i++) {
    state.users[`u${i}@jwt.com`] = { id: String(100 + i), name: `User ${i}`, email: `u${i}@jwt.com`, password: 'x', roles: [{ role: Role.Diner }] };
  }
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();

  const prev = page.getByRole('button', { name: 'Prev' });
  const next = page.getByRole('button', { name: 'Next' });
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toBeVisible();
  await expect(prev).toBeDisabled();

  await next.click();
  await expect(page.getByRole('row', { name: /User 21/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toHaveCount(0);
  await expect(next).toBeDisabled();

  await prev.click();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toBeVisible();
});

test('admin deletes a user', async ({ page }) => {
  const state = await mockService(page);
  await login(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();

  await page.getByRole('row', { name: /Kai Chen/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row', { name: /Kai Chen/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /f@jwt.com/ })).toBeVisible();
  expect(state.users['d@jwt.com']).toBeUndefined();

  // The deleted user can no longer log in.
  await logout(page);
  await login(page, 'd@jwt.com', 'a');
  await expect(page.getByText('unknown user')).toBeVisible();
});
