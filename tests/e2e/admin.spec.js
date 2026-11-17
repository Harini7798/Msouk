// FT4 — Tool-based automation (Playwright), black-box: every test drives only the rendered
// page (clicks, typed text, file choosers), never imports from src/. The backend (porodo/main.py)
// isn't present in this repo, so /api/** is stubbed at the network layer — the same stubbing the
// FT3 report describes for Paymob — letting the real admin UI run end to end.
import { test, expect } from '@playwright/test'
import path from 'node:path'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

// Stubs every /api/** call. /admin/me decides whether "sign in" succeeds; anything else
// gets an empty list, so dashboard/orders/etc. render their empty state instead of erroring.
async function stubApi(page, { tokenOk = true } = {}) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    if (url.includes('/admin/me')) {
      return tokenOk
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
        : route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Invalid admin token"}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function login(page, { tokenOk = true, landOn } = {}) {
  await stubApi(page, { tokenOk })
  if (landOn) await page.addInitScript((tab) => localStorage.setItem('adminTab', tab), landOn)
  await page.goto('/')
  await page.getByLabel('Admin token').fill('test-admin-token')
  await page.getByRole('button', { name: /sign in/i }).click()
}

test.describe('BB — Black-box: sign-in', () => {
  test('BB-01 the sign-in form is shown with an admin token field', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Admin token')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('BB-02 an empty token cannot be submitted (native required validation)', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('Admin token')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(input).toHaveJSProperty('validity.valid', false)
    await expect(input).toBeVisible() // the form never submitted, so we're still on the login screen
  })

  test('BB-03 an invalid token shows an error and does not sign in', async ({ page }) => {
    await login(page, { tokenOk: false })
    await expect(page.getByText('Invalid admin token')).toBeVisible()
    await expect(page.getByLabel('Admin token')).toBeVisible()
  })

  test('BB-04 a valid token signs in and shows the admin navigation', async ({ page }) => {
    await login(page, { tokenOk: true })
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Products file' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('BB-05 signing out returns to the sign-in form', async ({ page }) => {
    await login(page, { tokenOk: true })
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Admin token')).toBeVisible()
  })
})

test.describe('BB — Black-box: Products file (client-side, no backend)', () => {
  test('BB-06 the empty state offers to import products.json', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await expect(page.getByText('Import products.json')).toBeVisible()
  })

  test('BB-07 importing a valid file lists every product and its price', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'sample-products.json'))
    await expect(page.getByText('3 products · 1 groups')).toBeVisible()
    await expect(page.getByText('Redmi 17 4/128GB - Black')).toBeVisible()
    await expect(page.getByText('45.500 OMR').first()).toBeVisible()
  })

  test('BB-08 importing malformed JSON shows a readable error, not a crash', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'invalid.json'))
    await expect(page.getByText(/valid JSON/i)).toBeVisible()
  })

  test('BB-09 a product missing an image is flagged under Problems', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'sample-products.json'))
    await page.getByRole('button', { name: /^Problems/ }).click()
    await expect(page.getByText('Broken Product (no image)')).toBeVisible()
    await expect(page.getByText('Redmi 17 4/128GB - Black')).not.toBeVisible()
  })

  test('BB-10 an imported product with a name over 150 characters is flagged and blocked — regression for D-01', async ({ page }) => {
    // The editor's own Name field caps typing at 150 characters (maxlength), so the only way an
    // over-length name reaches the admin is through an imported file — exactly what this covers.
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'long-name-product.json'))
    await page.getByRole('button', { name: /^Problems/ }).click()
    await page.getByText('nnnn', { exact: false }).click()
    const drawer = page.getByRole('dialog', { name: 'Edit product' })
    await drawer.getByRole('button', { name: 'Save changes' }).click()
    await expect(drawer.getByText('Name can be at most 150 characters.')).toBeVisible()
  })

  test('BB-11 downloading a file with a problem product warns, then still downloads on confirm', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'sample-products.json'))
    page.once('dialog', (d) => {
      expect(d.message()).toContain('problems the store can’t load')
      d.accept()
    })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download products.json' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('products.json')
  })

  test('BB-12 two products sharing a group key show each other as "Other versions"', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'sample-products.json'))
    await page.getByText('Redmi 17 4/128GB - Black').click()
    await expect(page.getByText('Other versions customers will see (1)')).toBeVisible()
  })

  test('BB-13 two products imported with the same ID are both flagged as a problem', async ({ page }) => {
    await login(page, { landOn: 'productsFile' })
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'duplicate-id.json'))
    await expect(page.getByRole('button', { name: /^Problems/ })).toHaveText('Problems2')
    await page.getByRole('button', { name: /^Problems/ }).click()
    await page.getByText('First Product').click()
    const drawer = page.getByRole('dialog', { name: 'Edit product' })
    await drawer.getByRole('button', { name: 'Save changes' }).click()
    await expect(drawer.getByText('ID #1 is used by more than one product.')).toBeVisible()
  })
})
