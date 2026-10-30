/*
 * Author: Jeroen Jonckheer
 * Playwright config for producing the README demo recording.
 *
 * It esbuild-bundles the harness (harness/demo.tsx -> harness/demo.js +
 * demo.css), serves harness/ statically, then the spec in e2e-demo/ drives
 * the control while Playwright records video. The .webm under demo-output/
 * is converted to media/demo.gif with ffmpeg (see the Demo & Media wiki page).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const SIZE = { width: 980, height: 760 };

export default defineConfig({
    testDir: "./e2e-demo",
    workers: 1,
    timeout: 120000,
    outputDir: "./demo-output",
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        headless: true,
        viewport: SIZE,
        video: { mode: "on", size: SIZE },
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], viewport: SIZE },
        },
    ],
    // Build the harness bundle to disk, then serve it with a tiny Node static
    // server (serve.cjs) so our own index.html is served verbatim. We do NOT
    // reuse an existing server - a stale esbuild dev server on this port once
    // served a generated index.html referencing /main.js and broke the run.
    webServer: {
        command: `npx esbuild harness/demo.tsx --bundle --outfile=harness/demo.js && node e2e-demo/serve.cjs harness ${PORT}`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: false,
        timeout: 60000,
    },
});
