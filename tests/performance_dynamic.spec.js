const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const game = 'sweet';
const LCP_THRESHOLD = 2500; // 2.5 seconds (Standard for "Good")
// Helper: wait until a stable game page with <canvas> is detected
async function waitForStableGamePage(context, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const pages = context.pages();
    for (const p of pages) {
      if (!p.isClosed()) {
        try {
          const hasCanvas = await p.$('canvas');
          if (hasCanvas) {
            console.log('🎯 Stable game page detected');
            return p;
          }
        } catch {
          // ignore transient errors
        }
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('❌ No stable game page found within timeout');
}

test('Unified Casino Performance Audit: Sweet Bonanza', async () => {
  const browser = await chromium.launch({ headless: !!process.env.CI });
  const context = await browser.newContext();
  const page = await context.newPage();

  test.setTimeout(240000);
  const tracePath = `performance_trace_${Date.now()}.json`;
  const auditResults = { startTime: Date.now(), gameMetrics: {}, webVitals: {}, networkStats: {} };

 // --- 1. AUTHENTICATION ---

  console.log('🔐 Navigating to Login Page...');

  await page.goto('https://games.pragmaticplaylive.net/authentication/authenticate.jsp', {

    waitUntil: 'networkidle'

  });

  const userField = page.locator('input[name="username"]');

  const passField = page.locator('input[name="password"]');

  const loginBtn = page.getByRole('button', { name: 'Verify me!' });

  await userField.waitFor({ state: 'visible', timeout: 15000 });

  await userField.type('abdulg', { delay: 100 });

  await passField.type('abdulg123', { delay: 100 });

  await expect(loginBtn).toBeEnabled({ timeout: 10000 });

  await loginBtn.click();

  // --- 2. DESKTOP BUTTON CLICK ---
  console.log('🖥️ Clicking DESKTOP SOLUTION → HTML5 button...');
  const lobbyPromise = context.waitForEvent('page');
  await page.locator('div.buttons h1:text("DESKTOP SOLUTION")')
    .locator('..')
    .locator('button').click({ modifiers: ['Control'] });

  const lobbyPage = await lobbyPromise;
  await lobbyPage.bringToFront();
  await lobbyPage.waitForLoadState('domcontentloaded');

  // --- 3. GAME SEARCH ---
  console.log('🔍 Searching for Sweet Bonanza...');
  await lobbyPage.getByTestId('lobby-category-search').click();
  await lobbyPage.getByTestId('input-field').click();
  await lobbyPage.getByTestId('input-field').fill(game);
  await lobbyPage.waitForSelector('[data-testid="tile-container"]', { timeout: 60000 });
  const gameTile = lobbyPage.getByTestId('tile-container').first();
  await expect(gameTile).toBeVisible({ timeout: 20000 });
  await expect(gameTile).toContainText(new RegExp(game, 'i'));
  await gameTile.click();

  // --- 4. GAME LAUNCH ---
  const gamePage = await waitForStableGamePage(context);
  await gamePage.bringToFront();
  await gamePage.waitForLoadState('domcontentloaded');
  console.log(`🌐 Game page URL: ${gamePage.url()}`);

  // --- 5. CDP INIT & TRACE ---
  console.log('🔧 Initializing CDP session...');
  let client;
  try {
    client = await context.newCDPSession(gamePage);
    await client.send('Performance.enable');
    await client.send('Overlay.setShowFPSCounter', { show: true });
    console.log('✅ CDP session created');
  } catch (err) {
    console.error('❌ CDP initialization failed:', err.message);
  }

  console.log('📊 Starting Chrome tracing...');
  try {
    await browser.startTracing(gamePage, {
      path: tracePath,
      screenshots: true,
      categories: [
        'devtools.timeline',
        'blink.user_timing',
        'v8.execute',
        'disabled-by-default-devtools.timeline.frame'
      ]
    });
    console.log('✅ Tracing started');
  } catch (err) {
    console.error('❌ Tracing failed to start:', err.message);
  }

  // --- 6. METRICS (FPS, Network, Web Vitals) ---
  try {
    await gamePage.waitForSelector('canvas', { timeout: 60000 });
    await gamePage.waitForTimeout(15000);

    const metrics = await gamePage.evaluate(async () => {
      // FPS
      const getFPS = () => new Promise(resolve => {
        let frames = 0;
        const start = performance.now();
        function calculate() {
          frames++;
          if (performance.now() - start < 2000) requestAnimationFrame(calculate);
          else resolve(Math.round(frames / 2));
        }
        calculate();
      });

      // Resources
      const resources = performance.getEntriesByType('resource');
      const totalBytes = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
      const resourceDetails = resources.map(r => ({
        name: r.name.split('/').pop().split('?')[0],
        duration: r.duration.toFixed(2),
        sizeKB: ((r.transferSize || 0) / 1024).toFixed(2)
      }));

      // Largest Contentful Paint
      let lcpValue = 0;
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        lcpValue = lastEntry.startTime || 0;
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      return {
        fps: await getFPS(),
        payloadMB: (totalBytes / (1024 * 1024)).toFixed(2),
        totalRequests: resources.length,
        resourceDetails,
        lcp: lcpValue
      };
    });

    auditResults.gameMetrics = {
      fps: metrics.fps,
      payloadMB: metrics.payloadMB,
      totalRequests: metrics.totalRequests
    };
    auditResults.networkStats = {
      totalRequests: metrics.totalRequests,
      transferSizeKB: (parseFloat(metrics.payloadMB) * 1024).toFixed(2),
      topSlowAssets: metrics.resourceDetails
        .filter(r => parseFloat(r.duration) > 100)
        .sort((a, b) => parseFloat(b.duration) - parseFloat(a.duration))
        .slice(0, 3)
    };
    auditResults.webVitals = { LCP: metrics.lcp.toFixed(2) + ' ms' };

    console.log('✅ Metrics collected');
  } catch (e) {
    console.error('⚠️ Performance capture failed:', e.message);
  }

  // --- 7. SUMMARY ---
  const totalDuration = ((Date.now() - auditResults.startTime) / 1000).toFixed(1);
  try {
    await browser.stopTracing();
    if (client) await client.detach();
  } catch (err) {
    console.error('❌ Failed to stop tracing or detach CDP:', err.message);
  }

//--- 7. SUMMARY ---
// NEW: Calculate Pass/Fail Status
  const currentLCP = parseFloat(auditResults.webVitals.LCP);
  const isLcpHealthy = currentLCP <= LCP_THRESHOLD;
  const status = isLcpHealthy ? '✅ PASSED' : '❌ FAILED';

  try {
    await browser.stopTracing();
    if (client) await client.detach();
  } catch (err) {
    console.error('❌ Failed to stop tracing or detach CDP:', err.message);
  }

  console.log('\n==================================================');
  console.log(`🏆 PERFORMANCE AUDIT SUMMARY: ${status}`); // Updated line
  console.log('==================================================');
  if (!isLcpHealthy) {
    console.log(`⚠️  ALERT: LCP (${currentLCP}ms) exceeds budget of ${LCP_THRESHOLD}ms`);
  }
  console.log(`⏱️  Total Session Time: ${totalDuration}s`);
  console.log(`🖼️  Game Smoothness:   ${auditResults.gameMetrics.fps} FPS`);
  console.log(`📦 Resource Payload:  ${auditResults.gameMetrics.payloadMB} MB`);
  console.log(`📡 Network Requests:  ${auditResults.gameMetrics.totalRequests}`);
  console.log(`🌐 LCP:               ${auditResults.webVitals.LCP}`);
  console.log(`📂 Trace File Saved:  ${tracePath}`);
  console.log('Top Slow Assets:', auditResults.networkStats.topSlowAssets);
  console.log('==================================================\n');

  fs.writeFileSync('audit_results.json', JSON.stringify(auditResults, null, 2));

  await browser.close();
});
