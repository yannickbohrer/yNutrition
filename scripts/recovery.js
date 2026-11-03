#!/usr/bin/env node
// @ts-check
/**
 * Emergency access: prints a one-time passkey registration link (valid 1 hour).
 *   docker compose exec app node scripts/recovery.js
 */
import crypto from 'node:crypto';
import { loadDotEnv, openAndMigrate } from './lib/db.js';

loadDotEnv();
const secret = process.env.SESSION_SECRET || 'dev-insecure-session-secret';
const origin = (process.env.ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const ttlMinutes = Number(process.argv[2] ?? 60);

const token = crypto.randomBytes(24).toString('base64url');
const hash = crypto.createHmac('sha256', secret).update(token).digest('base64url');
const db = openAndMigrate();
db.prepare(
	"insert into setup_tokens (token_hash, purpose, expires_at) values (?, 'recovery', ?)"
).run(hash, Date.now() + ttlMinutes * 60_000);
db.close();

console.log(
	`\nOne-time passkey registration link (valid ${ttlMinutes} min):\n\n  ${origin}/setup?token=${token}\n`
);
