const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { exec } = require('child_process');

const game = 'Auto Roulette';
const HISTORY_FILE = 'performance_history.json';

// --------------------------------------------------
// HTML REPORT GENERATOR (UNCHANGED STRUCTURE)
// --------------------------------------------------
function safe(value, decimals = 2) {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return 'N/A';
    }
    if (typeof value === 'number') {
        return value.toFixed(decimals);
    }
    return value;
}
function generateHtmlReport(data, path) {

// ---------------------------
// HISTORY HANDLING (LAST 5)
// ---------------------------

let history = [];

try {
    if (fs.existsSync(HISTORY_FILE)) {
        const content = fs.readFileSync(HISTORY_FILE, 'utf8');
        if (content.trim()) {
            history = JSON.parse(content);
        }
    }
} catch (err) {
    console.log("⚠ History file corrupted. Resetting.");
    history = [];
}

// Push current run
history.push(data);

// Keep only last 5 executions
if (history.length > 5) {
    history = history.slice(-5);
}

// Save back
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

const lastRun = history.length > 1
    ? history[history.length - 2]
    : null;

const html = `<!DOCTYPE html>
<html>
<head>
<title>${game} Performance Dashboard</title>
<style>
body{font-family:Arial;background:#f1f5f9;margin:0}
.header{background:#0f172a;color:white;padding:20px;text-align:center}
.container{max-width:1200px;margin:20px auto;padding:0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
.card{background:white;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.08)}
.value{font-size:22px;font-weight:bold;margin-top:5px}
table{width:100%;border-collapse:collapse;margin-top:15px}
td,th{border:1px solid #ddd;padding:8px;font-size:12px}
</style>
</head>
<body>

<div class="header">
<h1>🎰 ${game} Performance Dashboard</h1>
</div>

<div class="container">

<div class="grid">
<div class="card"><div>FPS</div><div class="value">${safe(data.gameMetrics.fps)}</div></div>
<div class="card"><div>LCP</div><div class="value">${safe(data.gameMetrics.lcp)} ms</div></div>
<div class="card"><div>CLS</div><div class="value">${safe(data.gameMetrics.cls)}</div></div>
<div class="card"><div>Payload</div><div class="value">${safe(data.gameMetrics.payloadMB)} MB</div></div>
<div class="card"><div>Memory</div><div class="value">${safe(data.gameMetrics.memory.used)} MB</div></div>
<div class="card"><div>CPU Avg</div><div class="value">${safe(data.gameMetrics.cpu.avgCPUPercent)} %</div></div>
<div class="card"><div>Frame Drops</div><div class="value">${safe(data.gameMetrics.frameDrops)}</div></div>
<div class="card"><div>Long Tasks</div><div class="value">${safe(data.gameMetrics.longTasks)}</div></div>
<div class="card"><div>Net Latency</div><div class="value">${safe(data.gameMetrics.avgNetworkLatency)} ms</div></div>
<div class="card"><div>Memory Leak</div><div class="value">${safe(data.gameMetrics.memoryGrowthMB)} MB</div></div>
</div>

<h3>Round Metrics</h3>
<table>
<tr><th>Average</th><th>Min</th><th>Max</th><th>BPM</th></tr>
<tr>
<td>${safe(data.gameMetrics.rounds.average)}</td>
<td>${safe(data.gameMetrics.rounds.min)}</td>
<td>${safe(data.gameMetrics.rounds.max)}</td>
<td>${safe(data.gameMetrics.rounds.betsPerMinute)}</td>
</tr>
</table>

<h3>Top Slowest Assets</h3>
<table>
<tr><th>Name</th><th>Duration</th><th>Size</th></tr>
${(data.networkStats.topSlowAssets || []).map(a => `
<tr>
<td>${a.name}</td>
<td>${a.duration} ms</td>
<td>${a.sizeKB} KB</td>
</tr>`).join('')}
</table>

<h3>Long Tasks (Main Thread Blocking)</h3>
<table>
<tr>
<th>Start Time</th>
<th>Duration</th>
<th>Blocking Time</th>
<th>Source</th>
</tr>

${(data.networkStats.longTaskDetails || []).map(t => `
<tr>
<td>${t.startTime} ms</td>
<td>${t.duration} ms</td>
<td>${t.blockingTime} ms</td>
<td>${t.name}</td>
</tr>`).join('')}

</table>


<!-- ============================= -->
<!-- LAST 5 EXECUTIONS SECTION -->
<!-- ============================= -->

<h3>Last 5 Executions</h3>
<table>
<tr>
<th>Time</th>
<th>FPS</th>
<th>CPU %</th>
<th>Memory</th>
<th>Avg Round</th>
<th>BPM</th>
<th>LCP</th>
<th>CLS</th>
</tr>

${history
    .slice()
    .reverse()
    .map(run => `
<tr>
<td>${new Date(run.startTime).toLocaleTimeString()}</td>
<td>${safe(run.gameMetrics?.fps)}</td>
<td>${safe(run.gameMetrics?.cpu?.avgCPUPercent)}</td>
<td>${safe(run.gameMetrics?.memory?.used)}</td>
<td>${safe(run.gameMetrics?.rounds?.average)}</td>
<td>${safe(run.gameMetrics?.rounds?.betsPerMinute)}</td>
<td>${safe(run.gameMetrics?.lcp)}</td>
<td>${safe(run.gameMetrics?.cls)}</td>
</tr>
`).join('')}

</table>

</div>
</body>
</html>`;

fs.writeFileSync(path, html);
}

// --------------------------------------------------
// ROUND MONITOR (YOUR ORIGINAL LOGIC)
// --------------------------------------------------
async function runRounds(page, numberOfRounds) {

    const latencies = [];
    const timer = page.locator('[data-testid="round-timer"]');
    const result = page.locator('[data-testid="win-message-container"]');

    for (let i = 1; i <= numberOfRounds; i++) {

    console.log(`--- Round ${i} ---`);

    await timer.waitFor({ state: 'visible', timeout: 200000 });
    const start = Date.now();
    console.log(`Round ${i} timing started...`);

    await result.waitFor({ state: 'visible', timeout: 200000 });
    const end = Date.now();

    const duration = end - start;
    latencies.push(duration);

    console.log(`Round ${i} result detected. Latency: ${duration}ms`);

    await result.waitFor({ state: 'hidden', timeout: 30000 });
}
    return latencies;
}

// --------------------------------------------------
// MAIN TEST
// --------------------------------------------------
test('Unified Casino Performance + Round Audit', async ({ page, context }) => {

    test.setTimeout(3000000);

    const auditResults = {
        startTime: Date.now(),
        gameMetrics: {},
        networkStats: {}
    };

    // -------------------------------------------
    // LOGIN FLOW (REAL)
    // -------------------------------------------
    
    // --------------------------------------------------
// STEP 1: Navigate to Authentication Page
// --------------------------------------------------

await page.goto(
    'https://games.pragmaticplaylive.net/authentication/authenticate.jsp',
    { waitUntil: 'networkidle' }
);


// --------------------------------------------------
// STEP 2: Login
// --------------------------------------------------

await page.locator('input[name="username"]').type('abdulg', {
    delay: 100
});

await page.locator('input[name="password"]').type('abdulg123', {
    delay: 100
});

await page.getByRole('button', {
    name: 'Verify me!'
}).click();


// --------------------------------------------------
// STEP 3: Open Desktop Lobby in New Tab
// --------------------------------------------------

const lobbyPromise = context.waitForEvent('page');

await page
    .locator('div.buttons h1:text("DESKTOP SOLUTION")')
    .locator('..')
    .locator('button')
    .click({ modifiers: ['Control'] });

const lobbyPage = await lobbyPromise;

await lobbyPage.bringToFront();

await lobbyPage.waitForLoadState('domcontentloaded');


// --------------------------------------------------
// STEP 4: Search Game in Lobby
// --------------------------------------------------

await lobbyPage.getByTestId('lobby-category-search').click();

await lobbyPage.getByTestId('input-field').click();

await lobbyPage.getByTestId('input-field').fill(game);


// --------------------------------------------------
// STEP 5: Wait for Game Tile & Validate
// --------------------------------------------------

await lobbyPage.waitForSelector(
    '[data-testid="tile-container"]',
    { timeout: 60000 }
);

const gameTile = lobbyPage
    .getByTestId('tile-container')
    .first();

await expect(gameTile).toBeVisible({
    timeout: 50000
});

await expect(gameTile).toContainText(
    new RegExp(game, 'i')
);


// --------------------------------------------------
// STEP 6: Launch Game
// --------------------------------------------------

await gameTile.click();


// --------------------------------------------------
// STEP 7: Wait for Stable Game Page (Canvas)
// --------------------------------------------------

const gamePage = await waitForStableGamePage(context);

// --------------------------------------------------
// WAIT FOR STABLE GAME PAGE
// --------------------------------------------------

async function waitForStableGamePage(context) {
    const start = Date.now();

    while (Date.now() - start < 30000) {
        for (const p of context.pages()) {
            if (!p.isClosed() && await p.$('canvas')) {
                return p;
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('Game Canvas Timeout');
}

await gamePage.waitForTimeout(15000);

await gamePage.evaluate(() => {

    window.__LCP = 0;
    window.__CLS = 0;
    window.__LONGTASKS = [];

    // LCP
    new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        window.__LCP = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    // CLS
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
                window.__CLS += entry.value;
            }
        }
    }).observe({ type: 'layout-shift', buffered: true });

    // Long Tasks
       new PerformanceObserver((list) => {

    list.getEntries().forEach(entry => {

        const script = document.currentScript
            ? document.currentScript.src
            : "main-thread";

        window.__LONGTASKS.push({
            startTime: entry.startTime.toFixed(2),
            duration: entry.duration.toFixed(2),
            blockingTime: (entry.duration > 50 ? entry.duration - 50 : 0).toFixed(2),
            source: script
        });

    });

}).observe({ type: 'longtask', buffered: true });

});



    

    // -------------------------------------------
    // START PERFORMANCE MONITORING
    // -------------------------------------------
    const client = await context.newCDPSession(gamePage);
    await client.send('Performance.enable');
    const startTime = Date.now();

    // FPS calculation
    const fps = await gamePage.evaluate(() => {
        return new Promise(resolve => {
            let frames = 0;
            let start = performance.now();
            function count() {
                frames++;
                if (performance.now() - start > 3000) {
                    resolve(Math.round(frames / 3));
                } else requestAnimationFrame(count);
            }
            requestAnimationFrame(count);
        });
    });
// -------------------------------------------
// FRAME DROP DETECTOR
// -------------------------------------------
const frameDrops = await gamePage.evaluate(() => {

    return new Promise(resolve => {

        let lastFrame = performance.now();
        let drops = 0;
        let frames = 0;

        function checkFrame() {

            const now = performance.now();
            const diff = now - lastFrame;

            if (diff > 50) {
                drops++;
            }

            frames++;
            lastFrame = now;

            if (frames > 300) {
                resolve(drops);
                return;
            }

            requestAnimationFrame(checkFrame);
        }

        requestAnimationFrame(checkFrame);

    });

});

// -------------------------------------------
// LONG TASK DETECTOR
// -------------------------------------------
const longTaskDetails = await gamePage.evaluate(() => window.__LONGTASKS || []);
const longTasks = longTaskDetails.length;

// -------------------------------------------
// NETWORK LATENCY TRACKING
// -------------------------------------------


let networkLatencies = [];

gamePage.on('request', request => {
    request.__startTime = Date.now();
});

gamePage.on('response', response => {

    const request = response.request();
    const start = request.__startTime;

    if (start) {
        const latency = Date.now() - start;
        networkLatencies.push(latency);
    }

});


    // Web Vitals + Memory
    const metrics = await gamePage.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const mem = performance.memory;

        return {
            lcp: window.__LCP || 0,
            cls: window.__CLS || 0,
            payloadMB: (resources.reduce((a,r)=>a+(r.transferSize||0),0)/1024/1024).toFixed(2),
            domNodes: document.getElementsByTagName('*').length,
            memoryUsed: (mem.usedJSHeapSize/1024/1024).toFixed(2),
            resourceDetails: resources.map(r=>({
                name:r.name.split('/').pop(),
                duration:r.duration.toFixed(2),
                sizeKB:((r.transferSize||0)/1024).toFixed(2)
            }))
        };
    });
const memoryBefore = await gamePage.evaluate(() => {

    return performance.memory
        ? performance.memory.usedJSHeapSize
        : 0;

});
    // -------------------------------------------
    // RUN ROUNDS
    // -------------------------------------------
    const roundLatencies = await runRounds(gamePage, 3);

    const avgNetworkLatency =
networkLatencies.length
? (networkLatencies.reduce((a,b)=>a+b,0) / networkLatencies.length).toFixed(2)
: 0;

    const memoryAfter = await gamePage.evaluate(() => {

    return performance.memory
        ? performance.memory.usedJSHeapSize
        : 0;

});

    // -------------------------------------------
    // STOP MONITORING
    // -------------------------------------------
    const endTime = Date.now();
    const runtime = (endTime - startTime) / 1000;

    const cdpMetrics = await client.send('Performance.getMetrics');
    const getMetric = name =>
        cdpMetrics.metrics.find(m => m.name === name)?.value || 0;

    const taskDuration = getMetric('TaskDuration');
    const avgCPUPercent = ((taskDuration / runtime) * 100).toFixed(2);
    const memoryGrowth =
((memoryAfter - memoryBefore) / 1024 / 1024).toFixed(2);

    // -------------------------------------------
    // ROUND ANALYTICS
    // -------------------------------------------
    const total = roundLatencies.reduce((a,b)=>a+b,0);
    const avg = total / roundLatencies.length;
    const bpm = ((roundLatencies.length / (total/1000)) * 60).toFixed(2);

    auditResults.gameMetrics = {
        fps,
        lcp: metrics.lcp.toFixed(2),
        cls: metrics.cls.toFixed(4),
        payloadMB: metrics.payloadMB,
        domNodes: metrics.domNodes,
        memory: { used: metrics.memoryUsed },
        cpu: {
            taskDuration: taskDuration.toFixed(2),
            avgCPUPercent
        },
        rounds: {
            average: Math.round(avg),
            min: Math.min(...roundLatencies),
            max: Math.max(...roundLatencies),
            betsPerMinute: bpm
        },

         frameDrops,
    longTasks,
    avgNetworkLatency,
    memoryGrowthMB: memoryGrowth
    };

    auditResults.networkStats.topSlowAssets =
        metrics.resourceDetails.sort((a,b)=>b.duration-a.duration).slice(0,10);

    auditResults.networkStats.longTaskDetails = longTaskDetails;

    // -------------------------------------------
    // GENERATE REPORT
    // -------------------------------------------
    
    generateHtmlReport(auditResults, 'casino-performance-report.html');
    exec('start casino-performance-report.html');
    console.log("✅ Performance Audit Completed");
});