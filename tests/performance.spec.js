const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');

test('Automated Live Casino Performance Audit', async ({ page }) => {
  test.setTimeout(90000);
  // 1. PROGRAMMATIC AUDITS (CDP Control)
  
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');

  // 2. CPU & SCRIPT EXECUTION (Trace Setup)
  // Agenda: Identify bottlenecks via "Long Tasks" and CPU usage.
  console.log('Initializing Deep Trace Recording...');
  await page.context().browser().startTracing(page, {
    path: 'performance_trace.json',
    screenshots: true,
    categories: [
        'devtools.timeline', 
        'blink.user_timing', 
        'v8.execute', 
        'disabled-by-default-devtools.timeline.frame' // For FPS/Smoothness
    ]
  });

  // 3. EXECUTION: Navigate to Game
  const startTime = Date.now();
  // REPLACE with your Pragmatic Play URL
  await page.goto('https://games.pragmaticplaylive.net/authentication/authenticate.jsp', { 
    waitUntil: 'domcontentloaded', 
    timeout: 60000 }); 
    await page.waitForTimeout(5000);
  const totalLoadTime = Date.now() - startTime;

  // 4. NETWORK STATISTICS (Performance API)
  // Agenda: Extracting resource timings and transfer sizes.
  const networkStats = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    return {
      totalRequests: resources.length,
      transferSizeKB: (resources.reduce((acc, r) => acc + r.transferSize, 0) / 1024).toFixed(2),
      resourceDetails: resources.map(r => ({
        name: r.name.split('/').pop().split('?')[0], // Clean filename
        duration: r.duration.toFixed(2),
        size: (r.transferSize / 1024).toFixed(2) + ' KB'
      })).filter(r => parseFloat(r.duration) > 100) // Only show assets taking > 100ms
    };
  });

  // 5. CORE WEB VITALS (LCP)
  // Agenda: Critical for high-performance gaming.
  const coreWebVitals = await page.evaluate(() => {
    return new Promise((resolve) => {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        resolve({
          LCP: lastEntry.startTime.toFixed(2) + ' ms'
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      
      // Fallback if LCP doesn't fire immediately
      setTimeout(() => resolve({ LCP: 'Calculating...' }), 2000);
    });
  });

  // --- THE DEMO PRESENTATION OUTPUT ---
  console.log('\n==================================================');
  console.log('PERFORMANCE AUDIT SUMMARY');
  console.log('==================================================');
  
  console.log('\n 1. PROGRAMMATIC AUDITS (CDP)');
  console.log(`   Status: Connected to Chrome DevTools Protocol`);
  console.log(`   Total Page Load Time: ${totalLoadTime} ms`);

  console.log('\n 2. NETWORK STATISTICS');
  console.log(`   Requests: ${networkStats.totalRequests}`);
  console.log(`   Data Transferred: ${networkStats.transferSizeKB} KB`);
  console.log(`   Top Slow Assets:`, networkStats.resourceDetails.slice(0, 3));

  console.log('\n 3. CORE WEB VITALS');
  console.log(`   Largest Contentful Paint (LCP): ${coreWebVitals.LCP}`);

  console.log('\n 4. CPU & SCRIPT EXECUTION');
  console.log(`   Artifact Generated: performance_trace.json`);
  console.log(`   Action: Drag this file into chrome://tracing for Flame Charts.`);
  console.log('==================================================\n');

  // 6. SAVE RESULTS FOR MEETING EVIDENCE
  fs.writeFileSync('network_stats.json', JSON.stringify(networkStats, null, 2));

  // Stop Tracing
  await page.context().browser().stopTracing();
});