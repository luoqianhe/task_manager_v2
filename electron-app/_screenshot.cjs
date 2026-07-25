const { _electron: electron } = require('playwright-core');

(async () => {
  const app = await electron.launch({
    args: [
      'out/main/index.js',
      '--user-data-dir=' + require('os').homedir() + '/Library/Application Support/task-organizer',
    ],
    env: { ...process.env, ELECTRON_RENDERER_URL: '' }
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await new Promise(r => setTimeout(r, 2500));
  await win.screenshot({ path: '/tmp/app-phase2a.png' });
  console.log('Screenshot 1 saved');

  // Click first task row (TaskRow uses a div, find by cursor-pointer class inside task list)
  const firstTask = await win.$('[class*="cursor-pointer"][class*="rounded-md"]:has(span)');
  if (firstTask) {
    await firstTask.click();
    await new Promise(r => setTimeout(r, 1000));
    await win.screenshot({ path: '/tmp/app-phase2b.png' });
    console.log('Screenshot 2 saved (with task selected)');
  } else {
    console.log('No task rows found');
  }

  await app.close();
})().catch(e => { console.error(e.message); process.exit(1); });
