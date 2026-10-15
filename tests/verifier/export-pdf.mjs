import { existsSync, mkdtempSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export function exportReportPDF(directory = fileURLToPath(new URL('../report/', import.meta.url))) {
  const html = resolve(directory, 'report.html'), output = resolve(directory, 'report.pdf');
  if (!existsSync(html)) throw new Error('No HTML report exists; run tests:verify first');
  const browser = [process.env.TEST_REPORT_BROWSER, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync);
  if (!browser) throw new Error('No supported local Chrome/Chromium found; open report.html and Print > Save as PDF');
  const temporary = mkdtempSync(join(tmpdir(), 'deposition-test-report-'));
  try {
    const generated = join(temporary, 'report.pdf');
    const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-pdf-header-footer', `--user-data-dir=${join(temporary, 'profile')}`, `--print-to-pdf=${generated}`, pathToFileURL(html).href], {encoding:'utf8', timeout:60000, maxBuffer:1024*1024});
    if (result.status !== 0 || !existsSync(generated) || readFileSync(generated).subarray(0,5).toString() !== '%PDF-') throw new Error(`PDF export failed: ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`);
    if (existsSync(output)) copyFileSync(output, resolve(directory, `report.previous-${Date.now()}.pdf`));
    copyFileSync(generated, output);
    console.log(`PDF report: ${output}`);
    return output;
  } finally { rmSync(temporary, {recursive:true, force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { exportReportPDF(); } catch (error) { console.error(error.message); process.exitCode=1; }
}
