/*
 * Author: Jeroen Jonckheer
 * Demo choreography for the README recording.
 *
 * Key constraints driving the design:
 *
 *   - Playwright's headless Chromium does NOT paint the OS cursor into the
 *     recording, so the harness injects a synthetic cursor (DemoCursor in
 *     demo.tsx) that follows `mousemove` events. This file makes sure those
 *     events are actually dispatched along the visible path.
 *
 *   - `page.mouse.move(x, y, { steps: N })` does dispatch N intermediate
 *     mousemove events, but with no delay between them - they all fire in
 *     a single microtask burst, so the browser never paints intermediate
 *     frames and the synthetic cursor appears to teleport. We therefore do
 *     the interpolation ourselves with a small `waitForTimeout` per step,
 *     so every step gets at least one paint frame and the cursor visibly
 *     glides between two points.
 *
 *   - Menu items are deliberately HOVERED with the cursor at their centre
 *     before being clicked, so Fluent's row highlight is captured.
 */
import { test, expect, Page, Locator } from "@playwright/test";

// Track the cursor position ourselves - Playwright does not expose it.
let curX = 0;
let curY = 0;

async function glideTo(
    page: Page,
    toX: number,
    toY: number,
    steps = 26,
    perStepDelay = 18
): Promise<void> {
    const startX = curX;
    const startY = curY;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(startX + (toX - startX) * t, startY + (toY - startY) * t);
        if (perStepDelay) await page.waitForTimeout(perStepDelay);
    }
    curX = toX;
    curY = toY;
}

async function moveTo(page: Page, loc: Locator, settle = 220): Promise<void> {
    const box = await loc.boundingBox();
    if (!box) throw new Error("no boundingBox for locator");
    await glideTo(page, box.x + box.width / 2, box.y + box.height / 2);
    if (settle) await page.waitForTimeout(settle);
}

async function clickInPlace(page: Page, holdMs = 90, afterMs = 220): Promise<void> {
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
    if (afterMs) await page.waitForTimeout(afterMs);
}

async function moveAndClick(page: Page, loc: Locator): Promise<void> {
    await moveTo(page, loc);
    await clickInPlace(page);
}

async function openHeaderMenu(page: Page, columnName: string): Promise<void> {
    const cell = page
        .locator(".jj-readonly-subgrid-header-area .ms-DetailsHeader-cell", {
            hasText: columnName,
        })
        .first();
    await moveAndClick(page, cell);
    await page.waitForSelector(".ms-ContextualMenu-list");
    await page.waitForTimeout(450);
}

async function pickMenuItem(page: Page, label: string): Promise<void> {
    const item = page.getByRole("menuitem", { name: label });
    // Move first so the cursor visibly traverses the menu and lands on the
    // item; then a small hold lets Fluent highlight it; then click.
    await moveTo(page, item, 380);
    await clickInPlace(page, 90, 900);
}

test("read-only subgrid demo", async ({ page }) => {
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    page.on("response", (r) => {
        if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
    });

    await page.goto("/index.html", { waitUntil: "networkidle" });
    await page.waitForSelector(".jj-readonly-subgrid-row", { timeout: 8000 });
    await page.evaluate(() => {
        const d = document as unknown as { fonts?: { ready?: Promise<unknown> } };
        return d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve();
    });
    // Belt-and-braces wait: fonts.ready can resolve before the icon woff2 is
    // actually rendered, so we hold here too. The first 3 seconds of the
    // recording are trimmed anyway (see Demo & Media wiki).
    await page.waitForTimeout(800);

    // Park the synthetic cursor visibly above the grid as the starting point.
    await page.mouse.move(120, 80);
    curX = 120;
    curY = 80;
    await page.waitForTimeout(600);

    // ---- Scroll through the rows -------------------------------------------
    await moveTo(page, page.locator(".jj-readonly-subgrid-body"), 250);
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, -440);
    await page.waitForTimeout(600);

    // ---- Sort: Account A->Z then Z->A --------------------------------------
    await openHeaderMenu(page, "Account");
    await pickMenuItem(page, "A to Z");
    await openHeaderMenu(page, "Account");
    await pickMenuItem(page, "Z to A");

    // ---- Group by City, then ungroup ---------------------------------------
    await openHeaderMenu(page, "City");
    await pickMenuItem(page, "Group by");
    await page.waitForTimeout(700);
    await openHeaderMenu(page, "City");
    await pickMenuItem(page, "Ungroup");

    // ---- Filter Account contains "cor" -------------------------------------
    await openHeaderMenu(page, "Account");
    await pickMenuItem(page, "Filter by");
    const filterBox = page.getByPlaceholder("typ om te filteren");
    await moveAndClick(page, filterBox);
    await page.keyboard.type("cor", { delay: 160 });
    await page.waitForTimeout(1400);
    await moveAndClick(page, page.getByRole("button", { name: "Wissen" }));
    await page.waitForTimeout(800);

    // ---- Hover + click the first Account lookup link -----------------------
    const link = page.locator(".jj-readonly-subgrid-link").first();
    await link.scrollIntoViewIfNeeded();
    await moveTo(page, link, 420);
    await clickInPlace(page, 90, 900);

    await expect(page.locator(".jj-readonly-subgrid-row").first()).toBeVisible();
});
