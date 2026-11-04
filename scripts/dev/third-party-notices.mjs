// Writes static/third-party-licenses.txt: the license text of every package that can reach a
// browser or the server at runtime. Runs before each build (npm "prebuild"), so it always matches
// what is installed. Fails on a license that isn't on the allowlist, so a copyleft package can't
// slip in unnoticed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'static/third-party-licenses.txt');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// dev dependencies whose code ends up in the build output
const BUNDLED_DEV_DEPS = ['svelte', '@sveltejs/kit', '@sveltejs/adapter-node', 'vite'];
const ALLOWED = new Set([
	'MIT',
	'ISC',
	'0BSD',
	'BSD-2-Clause',
	'BSD-3-Clause',
	'Apache-2.0',
	'BlueOak-1.0.0',
	'MPL-2.0',
	'(MIT OR CC0-1.0)',
	'(MIT AND Zlib)'
]);

/** @param {string} name @param {string} from */
function locate(name, from) {
	for (let dir = from; ; dir = path.dirname(dir)) {
		const candidate = path.join(dir, 'node_modules', name);
		if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
		if (dir === ROOT) return null;
	}
}

/** @type {Map<string, { name: string, version: string, license: string, author?: string, dir: string }>} */
const found = new Map();

/** @param {string} name @param {string} from @param {boolean} optional */
function visit(name, from, optional) {
	const dir = locate(name, from);
	if (!dir) {
		if (optional) return;
		throw new Error(`${name} is not installed`);
	}
	const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
	const key = `${meta.name}@${meta.version}`;
	if (found.has(key)) return;
	const author = typeof meta.author === 'string' ? meta.author : meta.author?.name;
	found.set(key, { name: meta.name, version: meta.version, license: meta.license, author, dir });
	for (const dep of Object.keys(meta.dependencies ?? {})) visit(dep, dir, false);
	for (const dep of Object.keys(meta.optionalDependencies ?? {})) visit(dep, dir, true);
}

for (const name of [...Object.keys(pkg.dependencies), ...BUNDLED_DEV_DEPS])
	visit(name, ROOT, false);

/** @param {string} dir */
function licenseText(dir) {
	const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
	return file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : null;
}

const disallowed = [...found.values()].filter((p) => !ALLOWED.has(p.license));
if (disallowed.length) {
	const list = disallowed.map((p) => `${p.name}@${p.version} (${p.license})`).join(', ');
	throw new Error(`license not on the allowlist: ${list}. Review it in ${import.meta.filename}`);
}

const apacheDir = locate('reflect-metadata', ROOT);
const apacheText = apacheDir && licenseText(apacheDir);
if (!apacheText?.includes('Apache License')) throw new Error('Apache-2.0 license text not found');

const line = '='.repeat(78);
/** @type {string[]} */
const withoutFile = [];
const sections = [...found.values()]
	.sort((a, b) => a.name.localeCompare(b.name))
	.map((p) => {
		let text = licenseText(p.dir);
		if (!text) {
			withoutFile.push(`${p.name}@${p.version}`);
			text =
				p.license === 'Apache-2.0'
					? apacheText
					: `The package declares ${p.license} and ships no license file. Author: ${p.author ?? 'not stated'}.`;
		}
		return `${line}\n${p.name} ${p.version} (${p.license})\n${line}\n\n${text}\n`;
	});

sections.push(`${line}
zxing-cpp (Apache-2.0), compiled into the zxing-wasm WebAssembly binary
https://github.com/zxing-cpp/zxing-cpp
${line}

${apacheText}
`);
sections.push(`${line}
Emscripten runtime (MIT or University of Illinois/NCSA), compiled into the zxing-wasm binary
https://github.com/emscripten-core/emscripten/blob/main/LICENSE
${line}
`);

fs.writeFileSync(OUT, `Third-party software used by yNutrition\n\n${sections.join('\n')}`);
console.log(`[notices] ${found.size} packages → ${path.relative(ROOT, OUT)}`);
if (withoutFile.length) console.log(`[notices] no license file in: ${withoutFile.join(', ')}`);
