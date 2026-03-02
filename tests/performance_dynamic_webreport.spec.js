const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { exec } = require('child_process');

/** * Note: If using Node.js < 18, you'll need: 
 * const fetch = require('node-fetch'); 
 */

const game = 'sweet';
const HISTORY_FILE = 'performance_history.json';
const LCP_THRESHOLD = 2500; 
const API_KEY = process.env.WPT_API_KEY || 'YOUR_WEBPAGETEST_API_KEY';

// --- WebPageTest Integration ---
async function runWebPageTest(url) {
    const response = await fetch(
        `https://www.webpagetest.org/runtest.php?url=${encodeURIComponent(url)}&k=${API_KEY}&f=json&location=Dulles:Chrome&runs=1`
    );
    const data = await response.json();
    
    if (!data.data || !data.data.jsonUrl) {
        throw new Error(`WebPageTest failed to initiate: ${data.statusText || 'Unknown Error'}`);
    }

    const resultUrl = data.data.jsonUrl;
    let result;
    let attempts = 0;

    // Poll for results (max 5 minutes)
    do {
        await new Promise(r => setTimeout(r, 10000)); 
        const res = await fetch(resultUrl);
        result = await res.json();
        attempts++;
    } while (result.statusCode < 200 && attempts < 30);

    return result.data.average.firstView;
}

// --- Helper: Wait for Game Page ---
async function waitForStableGamePage(context) {
    // This waits for the new tab/window opened by the click
    const page = await context.waitForEvent('page');
    await page.waitForLoadState('networkidle');
    return page;
}

// --- HTML Report Generator ---
function generateHtmlReport(data, path) {
    let history = [];
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const fileContent = fs.readFileSync(HISTORY_FILE, 'utf8');
            if (fileContent.trim().length > 0) history = JSON.parse(fileContent);
        }
    } catch (err) { history = []; }

    const lastRun = history.length > 0 ? history[history.length - 1] : null;
    history.push(data);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    const calcDiff = (curr, prev, reverse = false) => {
        if (!prev) return '';
        const diff = (parseFloat(curr) - parseFloat(prev)).toFixed(2);
        const isBetter = reverse ? diff > 0 : diff < 0;
        return `<span style="color: ${isBetter ? '#2ecc71' : '#e74c3c'}; font-size: 11px; font-weight:bold;">(${diff > 0 ? '+' : ''}${diff})</span>`;
    };

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Performance Audit: ${game.toUpperCase()}</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { font-family: 'Inter', system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #1e293b; }
            .sidebar { width: 100%; background: #0f172a; color: white; padding: 20px; text-align: center; box-sizing: border-box; }
            .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 25px; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
            .metric-box { padding: 15px; border-radius: 8px; background: #f8fafc; border-left: 5px solid #3b82f6; position: relative; }
            .label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; }
            .val { font-size: 24px; font-weight: 800; display: block; margin: 5px 0; color: #0f172a; }
            .trend-label { font-size: 12px; font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; background: white; border-radius: 8px; overflow: hidden; }
            th { text-align: left; padding: 12px; background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
            .tag { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; color: white; }
            .tag-script { background: #f59e0b; } .tag-image { background: #10b981; } .tag-media { background: #3b82f6; }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <h1 style="margin:0">🎰 ${game.toUpperCase()} Performance Dashboard</h1>
            <p style="opacity:0.7; font-size: 14px;">Playwright + WebPageTest Metrics</p>
        </div>
        <div class="container">
            <div class="card" style="margin-bottom:20px;">
                <h3>📈 Performance Trends (Last 15 Runs)</h3>
                <canvas id="perfChart" style="max-height: 250px;"></canvas>
            </div>

            <div class="grid">
                <div class="card">
                    <span class="label">FPS</span>
                    <span class="val">${data.gameMetrics.fps} FPS</span>
                    <span class="trend-label">${calcDiff(data.gameMetrics.fps, lastRun?.gameMetrics.fps, true)} vs last run</span>
                </div>
                <div class="card">
                    <span class="label">LCP</span>
                    <span class="val">${data.gameMetrics.lcp} ms</span>
                    <span class="trend-label">${calcDiff(data.gameMetrics.lcp, lastRun?.gameMetrics.lcp)} vs last run</span>
                </div>
                <div class="card">
                    <span class="label">CPU Strain</span>
                    <span class="val">${data.gameMetrics.cpuStrain}%</span>
                </div>
                <div class="card">
                    <span class="label">Memory</span>
                    <span class="val">${data.gameMetrics.memory.used} MB</span>
                </div>
            </div>

            <div class="card">
                <h3>🌍 External Benchmark (WebPageTest)</h3>
                <p><strong>Speed Index:</strong> ${data.externalBenchmarks.speedIndex}</p>
                <p><strong>LCP:</strong> ${data.externalBenchmarks.lcp} ms</p>
                <p><strong>TTFB:</strong> ${data.externalBenchmarks.ttfb} ms</p>
                <p><strong>CLS:</strong> ${data.externalBenchmarks.cls}</p>
                <p><strong>Payload Size:</strong> ${data.externalBenchmarks.bytesInMB} MB</p>
            </div>

            <div class="card">
                <h3>🐢 Slowest Assets</h3>
                <table>
                    <thead><tr><th>Type</th><th>Asset</th><th>Load Time</th><th>Size</th></tr></thead>
                    <tbody>
                        ${data.networkStats.topSlowAssets.map(a => `
                            <tr>
                                <td><span class="tag tag-${a.type}">${a.type}</span></td>
                                <td>${a.name}</td>
                                <td>${a.duration} ms</td>
                                <td>${a.sizeKB} KB</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            const historyData = ${JSON.stringify(history.slice(-15))};
            const ctx = document.getElementById('perfChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: historyData.map(h => new Date(h.startTime).toLocaleTimeString()),
                    datasets: [
                        { label: 'FPS', data: historyData.map(h => h.gameMetrics.fps), borderColor: '#2ecc71', tension: 0.3 },
                        { label: 'CPU %', data: historyData.map(h => h.gameMetrics.cpuStrain), borderColor: '#9b59b6', tension: 0.3 },
                        { label: 'Memory (MB)', data: historyData.map(h => h.gameMetrics.memory.used), borderColor: '#3498db', tension: 0.3 }
                    ]
                },
                options: { responsive: true }
            });
        </script>
    </body>
    </html>`;
    fs.writeFileSync(path, htmlContent);
}

// --- MAIN TEST ---
test('Unified Casino Performance Audit with CPU + WebPageTest', async ({ page, context }) => {
    test.setTimeout(300000); // 5 minute timeout for WebPageTest polling
    const auditResults = { startTime: Date.now(), gameMetrics: {}, networkStats: {}, payloadBreakdown: {} };

    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');

    try {
        await page.goto('https://games.pragmaticplaylive.net/authentication/authenticate.jsp', { waitUntil: 'networkidle' });
        await page.locator('input[name="username"]').type('abdulg', { delay: 100 });
        await page.locator('input[name="password"]').type('abdulg123', { delay: 100 });
        await page.getByRole('button', { name: 'Verify me!' }).click();
       
        const lobbyPromise = context.waitForEvent('page');
        await page.locator('div.buttons h1:text("DESKTOP SOLUTION")').locator('..').locator('button').click({ modifiers: ['Control'] });
        const lobbyPage = await lobbyPromise;
        await lobbyPage.bringToFront(); 
        await lobbyPage.waitForLoadState('domcontentloaded');
       
        await lobbyPage.getByTestId('lobby-category-search').click();
        await lobbyPage.getByTestId('input-field').click();
        await lobbyPage.getByTestId('input-field').fill(game);
        await lobbyPage.waitForSelector('[data-testid="tile-container"]', { timeout: 60000 });
        const gameTile = lobbyPage.getByTestId('tile-container').first();
        await expect(gameTile).toBeVisible({ timeout: 50000 });
        await expect(gameTile).toContainText(new RegExp(game, 'i'));
        await gameTile.click();
       
        const gamePage = await waitForStableGamePage(context);
        await gamePage.bringToFront();
        await gamePage.waitForTimeout(15000); 

        // 5. Capture CPU Data
        const perfMetrics = await client.send('Performance.getMetrics');
        const taskDuration = perfMetrics.metrics.find(m => m.name === 'TaskDuration')?.value || 1;
        const scriptDuration = perfMetrics.metrics.find(m => m.name === 'ScriptDuration')?.value || 0;
        const cpuStrain = ((scriptDuration / taskDuration) * 100).toFixed(2);

        // 6. Browser-side Metrics
        const metrics = await gamePage.evaluate(async () => {
            const getFPS = () => new Promise(r => {
                let f = 0; const s = performance.now();
                function c() { f++; if(performance.now()-s < 2000) requestAnimationFrame(c); else r(Math.round(f/2)); }
                c();
            });

            const getLCP = () => new Promise((resolve) => {
                let lcpValue = 0;
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    if (entries.length > 0) lcpValue = entries[entries.length - 1].startTime;
                });
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
                setTimeout(() => { observer.disconnect(); resolve(lcpValue.toFixed(2)); }, 1000);
            });

            const resources = performance.getEntriesByType('resource');
            const mem = performance.memory || { usedJSHeapSize: 0 };
            const getSum = (exts) => (resources.filter(r => exts.some(e => r.name.toLowerCase().includes(e))).reduce((a, b) => a + (b.transferSize || 0), 0) / (1024*1024)).toFixed(2);

            return {
                fps: await getFPS(),
                lcp: await getLCP(),
                memory: { used: (mem.usedJSHeapSize / 1024 / 1024).toFixed(2) },
                breakdown: {
                    js: getSum(['.js']),
                    img: getSum(['.png', '.jpg', '.webp', '.svg', '.atlas']),
                    media: getSum(['.mp3', '.mp4', '.ogg', '.wav'])
                },
                resourceDetails: resources.map(r => ({
                    name: r.name.split('/').pop().split('?')[0] || 'asset',
                    duration: r.duration.toFixed(2),
                    sizeKB: ((r.transferSize || 0) / 1024).toFixed(2),
                    type: r.name.includes('.js') ? 'script' : (['.png','.jpg','.webp','.atlas'].some(e => r.name.includes(e)) ? 'image' : 'media')
                }))
            };
        });

        auditResults.gameMetrics = { ...metrics, cpuStrain };
        auditResults.networkStats.topSlowAssets = metrics.resourceDetails.sort((a, b) => b.duration - a.duration).slice(0, 10);

        // 7. WebPageTest
        const wptMetrics = await runWebPageTest(gamePage.url());
        auditResults.externalBenchmarks = {
            speedIndex: wptMetrics.SpeedIndex,
            lcp: wptMetrics.LargestContentfulPaint,
            ttfb: wptMetrics.TTFB,
            cls: wptMetrics.CumulativeLayoutShift,
            bytesInMB: (wptMetrics.bytesIn / 1024 / 1024).toFixed(2)
        };

        // 8. Finalize Report
        const reportPath = 'revenue_performance_audit.html';
        generateHtmlReport(auditResults, reportPath);

        console.log(`✅ Audit Complete: ${reportPath}`);
        exec(`${process.platform === 'win32' ? 'start' : 'open'} ${reportPath}`);

    } catch (error) {
        console.error('Test Failed:', error);
        await page.screenshot({ path: `failure-${Date.now()}.png` });
        throw error;
    }
});