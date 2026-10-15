import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const reportPath = resolve(root, 'tests/report/report.html');
const priorReport = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : null;
const args = process.argv.slice(2);
const child = spawn(process.execPath, [resolve(root, 'tests/verifier/verify.mjs'), ...args.filter(arg => arg !== '--pdf')], {cwd: root, stdio: 'inherit'});
child.on('error', error => { console.error(error.message); process.exitCode = 2; });
child.on('close', async code => {
    const report = resolve(root, 'tests/report/report.html');
    const fresh = existsSync(report) && readFileSync(report, 'utf8') !== priorReport;
    console.log(fresh ? `Read or print the report: ${report}` : `No fresh report was produced; any earlier report is retained. Check the error above. Expected path: ${report}`);
    let pdfFailed=false;
    if (args.includes('--pdf') && fresh) {
        try { const {exportReportPDF}=await import('./verifier/export-pdf.mjs'); exportReportPDF(); }
        catch(error) { console.error(error.message); pdfFailed=true; }
    }
    process.exitCode = code || (pdfFailed ? 1 : 0);
});
