// FT3 consolidated test run: unit/integration tests (categorised as ECP/BVA/DT/WB/UT/IT),
// coverage and the production build, with one summary printed to the terminal.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const reportDir = path.join(root, 'report')
mkdirSync(reportDir, { recursive: true })

const lines = []
const log = (s = '') => { console.log(s); lines.push(s) }

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') }
  }
}

log('FixItUp-style consolidated test run — MSouq Admin (FT3)')
log('='.repeat(60))

// --- 1. Vitest, with coverage and a JSON report we can categorise ---
const jsonOut = path.join(tmpdir(), `msouq-vitest-${Date.now()}.json`)
const t0 = Date.now()
const vitestResult = run(`npx vitest run --coverage --reporter=json --outputFile="${jsonOut}"`)
const vitestSeconds = ((Date.now() - t0) / 1000).toFixed(1)

let report = { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, testResults: [] }
if (existsSync(jsonOut)) report = JSON.parse(readFileSync(jsonOut, 'utf8'))

// --- 2. Categorise every test by its ID prefix (ECP-/BVA-/DT-/WB-/UT-/IT-) ---
const CATEGORY_LABEL = {
  ECP: 'Equivalence class partitioning (ECP)',
  BVA: 'Boundary value analysis (BVA)',
  DT: 'Decision tables (cause-effect) (DT)',
  WB: 'White box (paths, MC/DC) (WB)',
  UT: 'Other unit tests (UT)',
  IT: 'Other integration tests (IT)',
}
const buckets = {}
for (const key of Object.keys(CATEGORY_LABEL)) buckets[key] = { executed: 0, passed: 0, failed: 0, failedIds: [] }

const idPattern = /^([A-Z]{2,3})-(\d+)/
for (const suite of report.testResults || []) {
  for (const a of suite.assertionResults || []) {
    const m = a.title.match(idPattern)
    if (!m || !buckets[m[1]]) continue
    const b = buckets[m[1]]
    b.executed++
    if (a.status === 'passed') b.passed++
    else { b.failed++; b.failedIds.push(`${m[1]}-${m[2]}`) }
  }
}

// --- 3. Production build ---
const t1 = Date.now()
const buildResult = run('npm run build')
const buildSeconds = ((Date.now() - t1) / 1000).toFixed(1)

// --- 4. Print the summary ---
log('')
log(`> vitest run --coverage (${report.numTotalTests} tests) ... ${report.numFailedTests ? `exit 1` : 'ok'} (${vitestSeconds} s)`)
log(`> npm run build ... ${buildResult.ok ? 'ok' : 'exit 1'} (${buildSeconds} s)`)
log('')
log('Execution summary')
const colW = { tech: 42, n: 10 }
log('  ' + 'Technique / level'.padEnd(colW.tech) + 'Executed'.padStart(colW.n) + 'Passed'.padStart(colW.n) + 'Failed'.padStart(colW.n))
let totalExec = 0, totalPass = 0, totalFail = 0
const allFailedIds = []
for (const [key, label] of Object.entries(CATEGORY_LABEL)) {
  const b = buckets[key]
  totalExec += b.executed; totalPass += b.passed; totalFail += b.failed
  allFailedIds.push(...b.failedIds)
  log('  ' + label.padEnd(colW.tech) + String(b.executed).padStart(colW.n) + String(b.passed).padStart(colW.n) + String(b.failed).padStart(colW.n))
}
log('  ' + 'Total (automated)'.padEnd(colW.tech) + String(totalExec).padStart(colW.n) + String(totalPass).padStart(colW.n) + String(totalFail).padStart(colW.n))

// --- 5. Coverage summary (from @vitest/coverage-v8 json-summary) ---
const covPath = path.join(root, 'coverage', 'coverage-summary.json')
if (existsSync(covPath)) {
  const cov = JSON.parse(readFileSync(covPath, 'utf8')).total
  log('')
  log(`  Coverage (productFile.js, api.js): ${cov.functions.pct}% functions, ${cov.lines.pct}% lines, ${cov.branches.pct}% branches`)
}
log(`  Build: ${buildResult.ok ? 'PASS' : 'FAIL'}`)

// --- 6. Failing test cases ---
log('')
if (allFailedIds.length) {
  log('Failing test cases')
  for (const id of allFailedIds) log(`  ${id}`)
} else {
  log('Failing test cases: none — all designed cases that were automated are passing.')
}
log('')
log(`Result: ${totalFail} of ${totalExec} automated FT3 test cases failing.`)

writeFileSync(path.join(reportDir, 'test-output.txt'), lines.join('\n') + '\n')
writeFileSync(path.join(reportDir, 'test-results.json'), JSON.stringify(report, null, 2))

process.exit(vitestResult.ok && buildResult.ok ? 0 : 1)
