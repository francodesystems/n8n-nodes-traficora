// Runs the same static analysis as `npx @n8n/scan-community-package` (step 3,
// both legs) on this checkout, before publishing: the npm provenance and
// GitHub source steps of the real scan need a published release.
// The scanner is installed apart, in .scan/ (it ships its own eslint 9 and
// TypeScript 6, which would clash with this package's build tooling).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCANNER = '@n8n/scan-community-package@0.43.0';
const root = resolve(import.meta.dirname, '..');
const scanDir = join(root, '.scan');
const scannerFile = join(scanDir, 'node_modules/@n8n/scan-community-package/dist/scanner.js');
if (!existsSync(scannerFile)) {
	execFileSync('npm', ['install', '--prefix', scanDir, '--no-save', '--no-package-lock', '--ignore-scripts', SCANNER], {
		stdio: 'inherit',
	});
}
const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(scannerFile).href);
const work = mkdtempSync(join(tmpdir(), 'traficora-scan-'));
try {
	execFileSync('npm', ['pack', '--silent', '--pack-destination', work], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
	const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
	execFileSync('tar', ['xzf', tarball], { cwd: work });

	const source = await analyzePackage(root, SOURCE_FILE_PATTERNS);
	const dist = await analyzePackage(join(work, 'package'), ['**/*.js', 'package.json']);
	for (const [leg, result] of [['source', source], ['tarball', dist]]) {
		console.log(`${leg}: ${result.passed ? 'passed' : 'FAILED'}`);
		if (result.details) console.log(result.details);
	}
	process.exitCode = source.passed && dist.passed ? 0 : 2;
} finally {
	rmSync(work, { recursive: true, force: true });
}
