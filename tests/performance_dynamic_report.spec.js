const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { exec } = require('child_process');

const game = 'Stake Roulette';
const HISTORY_FILE = 'performance_history.json';

// ---------------------------
// HTML REPORT GENERATOR
// ---------------------------
function generateHtmlReport(data, path) {
    let history = [];

    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const content = fs.readFileSync(HISTORY_FILE, 'utf8');
            if (content.trim()) history = JSON.parse(content);
        }
    } catch (e) {
        history = [];
    }

    const lastRun = history.length ? history[history.length - 1] : null;

    history.push(data);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    const safe = (v, f = 'N/A') => (v !== undefined && v !== null ? v : f);

    const calcDiff = (curr, prev, reverse = false) => {
        if (!prev || curr === undefined) return '';
        const diff = (parseFloat(curr) - parseFloat(prev)).toFixed(2);
        const better = reverse ? diff > 0 : diff < 0;
        return `<span class="${better ? 'good' : 'bad'}">
                (${diff > 0 ? '+' : ''}${diff})
                </span>`;
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${game.toUpperCase()} Performance Dashboard</title>
    <style>
        body {
            margin:0;
            font-family: 'Inter', Arial, sans-serif;
            background:#f1f5f9;
            color:#1e293b;
        }
        .header {
            background:#0f172a;
            color:white;
            padding:20px;
            text-align:center;
        }
        .container {
            max-width:1200px;
            margin:20px auto;
            padding:0 20px;
        }
        .grid {
            display:grid;
            grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
            gap:20px;
            margin-bottom:25px;
        }
        .card {
            background:white;
            padding:20px;
            border-radius:12px;
            box-shadow:0 2px 6px rgba(0,0,0,0.08);
        }
        .label {
            font-size:12px;
            color:#64748b;
            text-transform:uppercase;
            font-weight:600;
        }
        .value {
            font-size:26px;
            font-weight:800;
            margin-top:5px;
        }
        .good { color:#16a34a; font-weight:bold; }
        .bad { color:#dc2626; font-weight:bold; }

        table {
            width:100%;
            border-collapse:collapse;
            margin-top:15px;
        }
        th {
            background:#f8fafc;
            text-align:left;
            padding:10px;
            font-size:12px;
            text-transform:uppercase;
            color:#64748b;
            border-bottom:1px solid #e2e8f0;
        }
        td {
            padding:10px;
            font-size:13px;
            border-bottom:1px solid #f1f5f9;
        }

        .tag {
            padding:4px 8px;
            border-radius:4px;
            font-size:10px;
            font-weight:bold;
            color:white;
        }
        .tag-script { background:#f59e0b; }
        .tag-image { background:#10b981; }
        .tag-media { background:#3b82f6; }

        .alert {
            background:#fee2e2;
            border:1px solid #fecaca;
            color:#991b1b;
            padding:15px;
            border-radius:8px;
            margin-bottom:20px;
            font-weight:600;
        }
    </style>
</head>

<body>

<div class="header">
    <h1>🎰 ${game.toUpperCase()} Performance Optimization Dashboard</h1>
    <p style="opacity:0.7;">Launch + Revenue Phase Monitoring</p>
</div>

<div class="container">

    ${
        lastRun &&
        parseFloat(data.gameMetrics?.memory?.used || 0) >
        parseFloat(lastRun.gameMetrics?.memory?.used || 0) + 15
        ? `<div class="alert">
            🚨 Memory Growth Detected. Possible runtime leak.
           </div>`
        : ''
    }

    <!-- Launch Metrics -->
    <div class="grid">
        <div class="card">
            <div class="label">FPS</div>
            <div class="value">
                ${safe(data.gameMetrics?.fps)}
                ${calcDiff(data.gameMetrics?.fps, lastRun?.gameMetrics?.fps, true)}
            </div>
        </div>

        <div class="card">
            <div class="label">Payload (MB)</div>
            <div class="value">
                ${safe(data.gameMetrics?.payloadMB)}
                ${calcDiff(data.gameMetrics?.payloadMB, lastRun?.gameMetrics?.payloadMB)}
            </div>
        </div>

        <div class="card">
            <div class="label">Memory (MB)</div>
            <div class="value">
                ${safe(data.gameMetrics?.memory?.used)}
                ${calcDiff(data.gameMetrics?.memory?.used, lastRun?.gameMetrics?.memory?.used)}
            </div>
        </div>

        <div class="card">
            <div class="label">DOM Nodes</div>
            <div class="value">${safe(data.gameMetrics?.domNodes)}</div>
        </div>
    </div>

    <!-- Round Metrics -->
    <div class="grid">
        <div class="card">
            <div class="label">Avg Round (ms)</div>
            <div class="value">
                ${safe(data.gameMetrics?.rounds?.average)}
                ${calcDiff(data.gameMetrics?.rounds?.average, lastRun?.gameMetrics?.rounds?.average)}
            </div>
        </div>

        <div class="card">
            <div class="label">Min Round</div>
            <div class="value">${safe(data.gameMetrics?.rounds?.min)}</div>
        </div>

        <div class="card">
            <div class="label">Max Round</div>
            <div class="value">${safe(data.gameMetrics?.rounds?.max)}</div>
        </div>

        <div class="card">
            <div class="label">⚡ Bets Per Minute</div>
            <div class="value">
                ${safe(data.gameMetrics?.rounds?.betsPerMinute)}
                ${calcDiff(data.gameMetrics?.rounds?.betsPerMinute, lastRun?.gameMetrics?.rounds?.betsPerMinute, true)}
            </div>
        </div>
    </div>

    <!-- Slow Assets -->
    <div class="card">
        <h3>🐢 Top 10 Slowest Assets</h3>
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Asset</th>
                    <th>Load Time</th>
                    <th>Size</th>
                </tr>
            </thead>
            <tbody>
                ${(data.networkStats?.topSlowAssets || []).map(a => `
                    <tr>
                        <td>
                            <span class="tag tag-${a.type === 'script' ? 'script' :
                                a.type === 'image' ? 'image' : 'media'}">
                                ${safe(a.type)}
                            </span>
                        </td>
                        <td>${safe(a.name)}</td>
                        <td>${safe(a.duration)} ms</td>
                        <td>${safe(a.sizeKB)} KB</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <!-- Last 5 Runs -->
    <div class="card">
        <h3>⏱ Last 5 Runs Comparison</h3>
        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>FPS</th>
                    <th>Payload</th>
                    <th>Memory</th>
                    <th>Avg Round</th>
                    <th>BPM</th>
                </tr>
            </thead>
            <tbody>
                ${history.slice(-5).reverse().map(run => `
                    <tr>
                        <td>${new Date(run.startTime).toLocaleTimeString()}</td>
                        <td>${safe(run.gameMetrics?.fps)}</td>
                        <td>${safe(run.gameMetrics?.payloadMB)}</td>
                        <td>${safe(run.gameMetrics?.memory?.used)}</td>
                        <td>${safe(run.gameMetrics?.rounds?.average)}</td>
                        <td>${safe(run.gameMetrics?.rounds?.betsPerMinute)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

</div>
</body>
</html>
`;

    fs.writeFileSync(path, html);
}



// ---------------------------
// ROUND MONITOR
// ---------------------------

async function runRounds(page, numberOfRounds) {
  const latencies = [];
  const timerSelector = '[data-testid="round-timer"]';
  const resultSelector = '[data-testid="win-message-container"]';

  //const resultSelector = 'div[aria-label="YOU WIN"]';
  
  const timer = page.locator(timerSelector);
  const result = page.locator(resultSelector);

  for (let i = 1; i <= numberOfRounds; i++) {
    console.log(`--- Round ${i} ---`);

    // 1. Wait for timer to appear (Round Start)
    await timer.waitFor({ state: 'visible', timeout: 200000 });
    const start = Date.now();
    console.log(`Round ${i} timing started...`);

    // 2. Wait for "YOU WIN" to appear (Round End)
    await result.waitFor({ state: 'visible', timeout: 200000 });
    const end = Date.now();
    
    const duration = end - start;
    latencies.push(duration);
    console.log(`Round ${i} result detected. Latency: ${duration}ms`);

    // 3. CRITICAL: Wait for the WIN message to disappear before starting next loop
    // This prevents Round 2 from immediately "finishing" using Round 1's UI state.
    await result.waitFor({ state: 'hidden', timeout: 30000 });
    //console.log(`UI reset. Ready for next round.`);
  }

  return latencies;
}

// ---------------------------
// WAIT FOR GAME CANVAS
// ---------------------------
async function waitForStableGamePage(context) {
    const start = Date.now();
    while (Date.now() - start < 30000) {
        for (const p of context.pages()) {
            if (!p.isClosed() && await p.$('canvas')) return p;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Game Canvas Timeout');
}

// ---------------------------
// MAIN TEST
// ---------------------------
test('Unified Casino Performance + Round Audit', async ({ page, context }) => {
    test.setTimeout(3000000);

    const auditResults = {
        startTime: Date.now(),
        gameMetrics: {},
        networkStats: {}
    };

   await page.goto('https://games.pragmaticplaylive.net/authentication/authenticate.jsp', { 
    waitUntil: 'networkidle' 
    }); 
    await page.locator('input[name="username"]').type('abdulg', { delay: 100 }); 
    await page.locator('input[name="password"]').type('abdulg123', { delay: 100 }); 
    await page.getByRole('button', { name: 'Verify me!' }).click(); 
    
    const lobbyPromise = context.waitForEvent('page'); 
    await page.locator('div.buttons h1:text("DESKTOP SOLUTION")')
    .locator('..').locator('button').click({ modifiers: ['Control'] }); 
    const lobbyPage = await lobbyPromise; await lobbyPage.bringToFront(); 
    await lobbyPage.waitForLoadState('domcontentloaded'); 
    await lobbyPage.getByTestId('lobby-category-search').click(); 
    await lobbyPage.getByTestId('input-field').click(); 
    await lobbyPage.getByTestId('input-field').fill(game); 
    await lobbyPage.waitForSelector('[data-testid="tile-container"]', { 
        timeout: 60000 
    }); 
    const gameTile = lobbyPage.getByTestId('tile-container').first(); 
    await expect(gameTile).toBeVisible({ timeout: 50000 }); 
    await expect(gameTile).toContainText(new RegExp(game, 'i')); 
    await gameTile.click();

    const gamePage = await waitForStableGamePage(context);
    await gamePage.waitForTimeout(15000);

    // -------------------
    // PERFORMANCE METRICS
    // -------------------
    const metrics = await gamePage.evaluate(async () => {

        const getFPS = () => new Promise(resolve => {
            let frames = 0;
            const start = performance.now();
            function loop() {
                frames++;
                if (performance.now() - start < 2000)
                    requestAnimationFrame(loop);
                else resolve(Math.round(frames / 2));
            }
            loop();
        });

        const resources = performance.getEntriesByType('resource');
        const mem = performance.memory || { usedJSHeapSize: 0 };

        return {
            fps: await getFPS(),
            lcp: 0,
            payloadMB: (resources.reduce((a,r)=>a+(r.transferSize||0),0)/(1024*1024)).toFixed(2),
            memory: { used: (mem.usedJSHeapSize/1024/1024).toFixed(2) },
            domNodes: document.getElementsByTagName('*').length,
            resourceDetails: resources.map(r=>({
                name: r.name.split('/').pop(),
                duration: r.duration.toFixed(2),
                sizeKB: ((r.transferSize||0)/1024).toFixed(2),
                type: r.name.includes('.js')?'script':'asset'
            }))
        };
    });

    auditResults.gameMetrics = metrics;
    auditResults.networkStats.topSlowAssets =
        metrics.resourceDetails.sort((a,b)=>b.duration-a.duration).slice(0,10);

    // -------------------
    // RUN ROUNDS
    // -------------------
    const latencies = await runRounds(gamePage, 5);

if (latencies.length > 0) {
    const total = latencies.reduce((a, b) => a + b, 0);
    const average = total / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const totalSeconds = total / 1000;
    const betsPerMinute = (latencies.length / totalSeconds) * 60;

    auditResults.gameMetrics.rounds = {
        average: Math.round(average),
        min: Math.round(min),
        max: Math.round(max),
        betsPerMinute: betsPerMinute.toFixed(2)
    };
} else {
    console.warn("⚠ No rounds captured");
    auditResults.gameMetrics.rounds = {
        average: 0,
        min: 0,
        max: 0,
        betsPerMinute: 0
    };
}


    const reportPath = 'revenue_performance_audit.html';
    generateHtmlReport(auditResults, reportPath);

    console.log(`Audit complete: ${reportPath}`);
    exec(`${process.platform === 'win32' ? 'start' : 'open'} ${reportPath}`);
});
