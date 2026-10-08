import { Page } from '@playwright/test';
import { expect } from './testSetup';
import { Franchise, Order, Role, User } from '../src/service/pizzaService';

const users: Record<string, User> = {
  'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
  'f@jwt.com': { id: '4', name: 'Fran Chise', email: 'f@jwt.com', password: 'f', roles: [{ role: Role.Diner }, { role: Role.Franchisee, objectId: '2' }] },
  'a@jwt.com': { id: '1', name: 'Admin', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
};

const menu = [
  { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
  { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
];

function initialFranchises(): Franchise[] {
  return [
    {
      id: '2',
      name: 'LotaPizza',
      admins: [{ id: '4', name: 'Fran Chise', email: 'f@jwt.com' }],
      stores: [
        { id: '4', name: 'Lehi', totalRevenue: 0.5 },
        { id: '5', name: 'Springville', totalRevenue: 0.25 },
        { id: '6', name: 'American Fork', totalRevenue: 0 },
      ],
    },
    { id: '3', name: 'PizzaCorp', admins: [], stores: [{ id: '7', name: 'Spanish Fork', totalRevenue: 1.5 }] },
    { id: '4', name: 'topSpot', admins: [], stores: [] },
    { id: '5', name: 'PizzaPocket', admins: [], stores: [] },
  ];
}

export interface MockState {
  loggedInUser: User | null;
  franchises: Franchise[];
  orders: Order[];
}

// Mocks every pizza service and pizza factory endpoint the frontend calls. The state is
// mutable so that creates, closes, and orders are reflected in later requests.
export async function mockService(page: Page): Promise<MockState> {
  const validUsers: Record<string, User> = { ...users };
  const state: MockState = { loggedInUser: null, franchises: initialFranchises(), orders: [] };

  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      state.loggedInUser = null;
      await route.fulfill({ json: { message: 'logout successful' } });
      return;
    }

    const req = route.request().postDataJSON();
    if (method === 'POST') {
      const user: User = { id: '9', name: req.name, email: req.email, password: req.password, roles: [{ role: Role.Diner }] };
      validUsers[req.email] = user;
      state.loggedInUser = user;
      await route.fulfill({ json: { user, token: 'registered' } });
      return;
    }

    expect(method).toBe('PUT');
    const user = validUsers[req.email];
    if (!user || user.password !== req.password) {
      await route.fulfill({ status: 401, json: { message: 'unknown user' } });
      return;
    }
    state.loggedInUser = user;
    await route.fulfill({ json: { user, token: 'abcdef' } });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: state.loggedInUser });
  });

  await page.route('*/**/api/order/menu', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menu });
  });

  await page.route('*/**/api/order', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { id: '1', dinerId: state.loggedInUser?.id, orders: state.orders } });
      return;
    }
    expect(method).toBe('POST');
    const order = { ...route.request().postDataJSON(), id: '23', date: '2024-06-05T05:14:40.000Z' };
    state.orders.push(order);
    await route.fulfill({ json: { order, jwt: 'eyJpYXQ' } });
  });

  await page.route('*/**/api/order/verify', async (route) => {
    expect(route.request().method()).toBe('POST');
    const { jwt } = route.request().postDataJSON();
    if (jwt !== 'eyJpYXQ') {
      await route.fulfill({ status: 401, json: { message: 'invalid' } });
      return;
    }
    await route.fulfill({ json: { message: 'valid', payload: { vendor: { id: 'byu', name: 'BYU' }, order: state.orders[0] } } });
  });

  await page.route('*/**/api/docs', async (route) => {
    const factory = route.request().url().includes('pizza-factory');
    await route.fulfill({
      json: {
        endpoints: [
          {
            requiresAuth: !factory,
            method: 'POST',
            path: factory ? '/api/order/verify' : '/api/order',
            description: factory ? 'Verify a pizza order' : 'Create an order for the authenticated user',
            example: 'curl -X POST localhost:3000/api/order',
            response: { ok: true },
          },
        ],
      },
    });
  });

  await page.route(/\/api\/franchise(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').slice(3); // segments after /api/franchise

    // GET /api/franchise?page=&limit=&name=
    if (method === 'GET' && parts.length === 0) {
      const pageNum = Number(url.searchParams.get('page') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const filter = (url.searchParams.get('name') ?? '*').replace(/\*/g, '').toLowerCase();
      const matched = state.franchises.filter((f) => f.name.toLowerCase().includes(filter));
      const franchises = matched.slice(pageNum * limit, (pageNum + 1) * limit);
      await route.fulfill({ json: { franchises, more: matched.length > (pageNum + 1) * limit } });
      return;
    }

    // GET /api/franchise/:userId
    if (method === 'GET' && parts.length === 1) {
      await route.fulfill({ json: state.franchises.filter((f) => f.admins?.some((a) => a.id === parts[0])) });
      return;
    }

    // POST /api/franchise
    if (method === 'POST' && parts.length === 0) {
      const franchise = { ...request.postDataJSON(), id: '10', stores: [] };
      state.franchises.push(franchise);
      await route.fulfill({ json: franchise });
      return;
    }

    // DELETE /api/franchise/:franchiseId
    if (method === 'DELETE' && parts.length === 1) {
      state.franchises = state.franchises.filter((f) => f.id !== parts[0]);
      await route.fulfill({ json: { message: 'franchise deleted' } });
      return;
    }

    const franchise = state.franchises.find((f) => f.id === parts[0])!;

    // POST /api/franchise/:franchiseId/store
    if (method === 'POST' && parts.length === 2) {
      const store = { ...request.postDataJSON(), id: '20', totalRevenue: 0 };
      franchise.stores.push(store);
      await route.fulfill({ json: store });
      return;
    }

    // DELETE /api/franchise/:franchiseId/store/:storeId
    expect(method).toBe('DELETE');
    franchise.stores = franchise.stores.filter((s) => s.id !== parts[2]);
    await route.fulfill({ json: { message: 'store deleted' } });
  });

  await page.goto('/');
  return state;
}

export async function login(page: Page, email: string, password: string) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}
