import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_DATA_PATH = join(process.cwd(), 'data', 'data.txt');

test.describe('Knowledge Graph POC - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText('Knowledge Graph POC');
  });

  test('should load the application and display UI elements', async ({ page }) => {
    // Check header
    await expect(page.locator('h1')).toContainText('Knowledge Graph POC');
    
    // Check connection status indicator (Generic)
    // Looking for the green/red dot in the header
    const connectionIndicator = page.locator('div.rounded-full.bg-\\[\\#10B981\\]').or(page.locator('div.rounded-full.bg-\\[\\#EF4444\\]'));
    await expect(connectionIndicator).toBeVisible();
    
    // Check graph visualization area exists
    const graphArea = page.locator('div').filter({ hasText: /Loading|Select a node/i }).or(page.locator('canvas')).first();
    await expect(graphArea).toBeVisible();
    
    // Check tabs are visible
    await expect(page.getByRole('button', { name: /Upload/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Input/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Details/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/i })).toBeVisible();
  });

  test('should display settings panel', async ({ page }) => {
    // Navigate to Settings
    await page.getByRole('button', { name: /Settings/i }).click();
    
    // Check for generic Settings header
    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible();
    
    // Check for Connection/Status section (Backend API Status)
    await expect(page.getByText(/Status/i).or(page.getByText(/Backend/i))).toBeVisible();
  });

  test('should handle file upload UI', async ({ page }) => {
    await page.getByRole('button', { name: /Upload/i }).click();
    await expect(page.getByText(/Drag and drop files/i)).toBeVisible();
    await expect(page.getByText(/TXT, PDF, CSV, DOCX/i)).toBeVisible();
  });

  test('should display graph controls', async ({ page }) => {
    await expect(page.getByTitle(/Zoom In/i).or(page.locator('button').filter({ hasText: /Zoom/i }))).toBeVisible();
    
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    // Filter button might be hidden if panel is open, check logic
    const filterPanel = page.locator('text=Filter Panel').or(page.locator('text=Entity Types'));
    const filterButton = page.getByRole('button', { name: /Filter/i });
    
    // Either the panel is visible OR the button to open it is visible
    if (await filterPanel.isVisible()) {
        expect(true).toBeTruthy(); 
    } else {
        await expect(filterButton).toBeVisible();
    }
    
    await expect(page.getByTitle(/Download PNG/i).or(page.getByRole('button', { name: /PNG/i }))).toBeVisible();
  });

  test('should interact with graph controls', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');
    await searchInput.clear();
  });

  test('should handle empty state', async ({ page }) => {
    const loadingSpinner = page.locator('.animate-spin').first();
    const loadingText = page.getByText(/Loading/i).first();
    const graphCanvas = page.locator('canvas').first();
    
    // At least one of these should be visible or exist in DOM
    const hasSpinner = await loadingSpinner.isVisible().catch(() => false);
    const hasLoadingText = await loadingText.isVisible().catch(() => false);
    const hasCanvas = await graphCanvas.isVisible().catch(() => false);
    
    expect(hasSpinner || hasLoadingText || hasCanvas).toBeTruthy();
  });

  test('should filter graph by document', async ({ page }) => {
    // 1. Go to upload tab
    await page.getByRole('button', { name: /Upload/i }).click();

    // 2. Upload test file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText(/Drag and drop/i).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(join(__dirname, 'test-data', 'test-doc.txt'));

    // 3. Wait for processing to complete
    await expect(page.locator('text=File processed successfully')).toBeVisible({ timeout: 20000 });

    // 4. Find and select the document in the dropdown
    const docFilter = page.locator('select');
    await docFilter.selectOption({ label: /test-doc.txt/ });
    
    // Give time for graph to re-render
    await page.waitForTimeout(2000); 

    // 5. Assert that the graph now shows only the nodes from that document
    // Note: The exact count may vary based on the AI model's output.
    // Expecting Person A, Person B, and the Document node itself.
    const entityCountTextFiltered = await page.locator('div.text-sm.text-\\[\\#94A3B8\\]').innerText();
    expect(entityCountTextFiltered).toMatch(/Viewing 3 of 3/);

    // 6. Go back to "All"
    await docFilter.selectOption({ label: /Load All/ });
    await page.waitForTimeout(2000);

    // 7. Assert that the graph now shows more nodes
    const entityCountTextAll = await page.locator('div.text-sm.text-\\[\\#94A3B8\\]').innerText();
    expect(parseInt(entityCountTextAll.split(' ')[1])).toBeGreaterThan(3);
  });
});