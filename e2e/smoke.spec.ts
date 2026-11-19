import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('StudyRoom End-to-End Suite', () => {
  test('home page renders, loads, and passes accessibility checks', async ({ page }) => {
    await page.goto('/');

    // Check title and create room header
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /create|buat/i })).toBeVisible();

    // Check accessibility with Axe
    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('can create a room, start timer, and send a chat message', async ({ page, isMobile }) => {
    await page.goto('/');

    // Fill Create Room Form
    const roomNameInput = page.getByRole('textbox', { name: /room name|nama ruangan/i });
    await expect(roomNameInput).toBeVisible();
    await roomNameInput.fill('E2E Test Room');

    const nicknameInput = page.getByRole('textbox', { name: /nickname|nama panggilan/i });
    await expect(nicknameInput).toBeVisible();
    await nicknameInput.fill('TesterHost');

    // Click Create
    const createBtn = page.getByRole('button', { name: /create room|buat ruangan/i });
    await createBtn.click();

    // Navigates to /r/:code
    await page.waitForURL(/\/r\/[A-Z0-9]{6}/i);
    await expect(page.locator('h1')).toContainText('E2E Test Room');

    // Start timer
    const startBtn = page.getByRole('button', { name: /start|mulai/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Pause button appears
    await expect(page.getByRole('button', { name: /pause|jeda/i })).toBeVisible();

    // On mobile, switch to chat tab first to see the chat panel
    if (isMobile) {
      const nav = page.locator('nav[aria-label]');
      const chatTabBtn = nav.getByRole('button', { name: /chat|obrolan/i });
      await chatTabBtn.click();
    }

    // Send a chat message
    const chatInput = page.getByPlaceholder(/type a message|ketik pesan/i);
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Hello from Playwright E2E!');
    await chatInput.press('Enter');

    // Message appears in chat history
    await expect(page.getByText('Hello from Playwright E2E!')).toBeVisible();

    // Accessibility check on active room page
    const roomAxe = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    expect(roomAxe.violations).toEqual([]);
  });

  test('responsive layout: mobile viewport renders navigation tabs', async ({ page, isMobile }) => {
    if (!isMobile) return;

    await page.goto('/');
    const roomNameInput = page.getByRole('textbox', { name: /room name|nama ruangan/i });
    await roomNameInput.fill('Mobile Room');
    const nicknameInput = page.getByRole('textbox', { name: /nickname|nama panggilan/i });
    await nicknameInput.fill('MobileHost');
    await page.getByRole('button', { name: /create room|buat ruangan/i }).click();

    await page.waitForURL(/\/r\/[A-Z0-9]{6}/i);

    // Mobile nav bar with tabs should be visible
    const nav = page.locator('nav[aria-label]');
    await expect(nav).toBeVisible();

    // Switch to Chat tab
    const chatTabBtn = nav.getByRole('button', { name: /chat|obrolan/i });
    await chatTabBtn.click();

    // Chat input is now visible
    const chatInput = page.getByPlaceholder(/type a message|ketik pesan/i);
    await expect(chatInput).toBeVisible();
  });
});
