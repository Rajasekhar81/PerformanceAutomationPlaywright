const fs = require('fs');

async function capturePerformance(page, testName) {
  const context = page.context();

  await context.tracing.start({
    screenshots: true,
    snapshots: true
  });

  await page.waitForLoadState('networkidle');

  const performanceData = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const navigation = performance.getEntriesByType('navigation')[0];

    const totalSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    return {
      pageLoadTime: navigation.loadEventEnd,
      totalRequests: resources.length,
      totalTransferSizeKB: (totalSize / 1024).toFixed(2)
    };
  });

  await context.tracing.stop({ path: `reports/${testName}-trace.zip` });

  fs.writeFileSync(
    `reports/${testName}-report.json`,
    JSON.stringify(performanceData, null, 2)
  );

  console.log(performanceData);
}

module.exports = { capturePerformance };
