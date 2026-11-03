import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const MOCK = 4199;
const env = {
	NODE_ENV: 'production',
	PORT: String(PORT),
	ORIGIN: `http://localhost:${PORT}`,
	RP_ID: 'localhost',
	DATABASE_PATH: 'e2e/.tmp/test.db',
	SETUP_TOKEN: 'e2e-setup-token',
	SESSION_SECRET: 'e2e-session-secret',
	OFF_BASE_URL: `http://localhost:${MOCK}`,
	OFF_SEARCH_URL: `http://localhost:${MOCK}`,
	OFF_CONTACT_EMAIL: 'e2e@example.invalid',
	TZ: 'Europe/Zurich'
};

// iPhone viewport/touch emulation, but on Chromium (needed for the CDP virtual authenticator)
const iphone = {
	...devices['iPhone 14'],
	browserName: 'chromium' as const,
	defaultBrowserType: 'chromium' as const
};

// iPad in both orientations (Chromium for the same reason)
const ipadPortrait = {
	...devices['iPad Pro 11'],
	browserName: 'chromium' as const,
	defaultBrowserType: 'chromium' as const
};
const ipadLandscape = {
	...devices['iPad Pro 11 landscape'],
	browserName: 'chromium' as const,
	defaultBrowserType: 'chromium' as const
};

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [['list']],
	timeout: 30_000,
	expect: { timeout: 7_000 },
	use: {
		baseURL: `http://localhost:${PORT}`,
		locale: 'de-CH',
		timezoneId: 'Europe/Zurich',
		trace: 'retain-on-failure',
		launchOptions: {
			args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
		}
	},
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.e2e\.ts/, use: iphone },
		{
			name: 'iphone',
			testIgnore: [/auth\.setup\.e2e\.ts/, /screenshots\.e2e\.ts/, /ipad\.e2e\.ts/],
			dependencies: ['setup'],
			use: { ...iphone, storageState: 'e2e/.tmp/state.json' }
		},
		{
			name: 'ipad-portrait',
			testMatch: /ipad\.e2e\.ts/,
			dependencies: ['setup'],
			use: { ...ipadPortrait, storageState: 'e2e/.tmp/state.json' }
		},
		{
			name: 'ipad-landscape',
			testMatch: /ipad\.e2e\.ts/,
			dependencies: ['setup'],
			use: { ...ipadLandscape, storageState: 'e2e/.tmp/state.json' }
		},
		{
			name: 'screenshots',
			testMatch: /screenshots\.e2e\.ts/,
			dependencies: ['setup'],
			use: { ...iphone, storageState: 'e2e/.tmp/state.json' }
		}
	],
	webServer: [
		{
			command: `node e2e/mock-off.mjs`,
			url: `http://localhost:${MOCK}/health`,
			reuseExistingServer: false,
			env: { MOCK_PORT: String(MOCK) }
		},
		{
			command:
				'rm -rf e2e/.tmp && mkdir -p e2e/.tmp && node scripts/import-swissfcd.js --load && node build/index.js',
			url: `http://localhost:${PORT}/api/health`,
			reuseExistingServer: false,
			env,
			timeout: 60_000
		}
	]
});
