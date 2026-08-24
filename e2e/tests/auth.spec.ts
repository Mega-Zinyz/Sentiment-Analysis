import { test, expect } from '@playwright/test';

function uniqueUser() {
  const id = Date.now();
  return {
    username: `e2e_user_${id}`,
    email: `e2e_user_${id}@example.com`,
    password: 'TestPass123'
  };
}

test.describe('Registration', () => {
  test('a new user can register and lands on the analysis page', async ({ page }) => {
    const user = uniqueUser();

    await page.goto('/register');

    await page.getByLabel('Nama Pengguna').fill(user.username);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Kata Sandi', { exact: true }).fill(user.password);
    await page.getByLabel('Konfirmasi Kata Sandi').fill(user.password);

    await page.getByRole('button', { name: /Buat Akun/ }).click();

    // Regression guard: registration used to redirect to the non-existent
    // '/home' route, which bounced the user straight back to /login.
    await page.waitForURL('**/analysis');
    await expect(page.getByRole('main').getByRole('heading', { name: /Analisis Sentimen/ })).toBeVisible();
  });

  test('shows a validation error when passwords do not match', async ({ page }) => {
    const user = uniqueUser();

    await page.goto('/register');

    await page.getByLabel('Nama Pengguna').fill(user.username);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Kata Sandi', { exact: true }).fill(user.password);
    await page.getByLabel('Konfirmasi Kata Sandi').fill('SomethingElse123');

    await page.getByRole('button', { name: /Buat Akun/ }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('Login', () => {
  test('a registered user can log in and reach the analysis page', async ({ page }) => {
    const user = uniqueUser();

    // Arrange: create the account via the register page first.
    await page.goto('/register');
    await page.getByLabel('Nama Pengguna').fill(user.username);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Kata Sandi', { exact: true }).fill(user.password);
    await page.getByLabel('Konfirmasi Kata Sandi').fill(user.password);
    await page.getByRole('button', { name: /Buat Akun/ }).click();
    await page.waitForURL('**/analysis');

    // Act: log out, then log back in through the login form.
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await page.getByLabel('Nama Pengguna').fill(user.username);
    await page.getByLabel('Kata Sandi').fill(user.password);
    await page.getByRole('button', { name: /Masuk/ }).click();

    await page.waitForURL('**/analysis');
    await expect(page.getByRole('main').getByRole('heading', { name: /Analisis Sentimen/ })).toBeVisible();
  });

  test('shows an error message on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Nama Pengguna').fill('no-such-user');
    await page.getByLabel('Kata Sandi').fill('wrong-password');
    await page.getByRole('button', { name: /Masuk/ }).click();

    await expect(page.getByText(/Invalid username or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Route protection', () => {
  test('an unauthenticated visitor is redirected to the login page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/analysis');

    await page.waitForURL('**/login');
  });
});
