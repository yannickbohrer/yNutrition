import { describe, expect, it } from 'vitest';
import { createTestDb } from './index';

describe('migrations', () => {
	it('creates tables and FTS', () => {
		const db = createTestDb();
		db.$client
			.prepare(
				`insert into foods (source, source_id, name_de, nutrients) values ('custom','1','Äpfel, roh','{}')`
			)
			.run();
		db.$client
			.prepare(
				`insert into foods (source, source_id, name_de, nutrients) values ('custom','2','Vollkornbrot','{}')`
			)
			.run();
		const r = db.$client.prepare(`select rowid from foods_fts where foods_fts match 'apf*'`).all();
		expect(r).toHaveLength(1);
		const t = db.$client
			.prepare(`select rowid from foods_tri where foods_tri match '"brot"'`)
			.all();
		expect(t).toHaveLength(1);
		db.$client.prepare(`update foods set name_de='Birne' where id=1`).run();
		expect(
			db.$client.prepare(`select rowid from foods_fts where foods_fts match 'apf*'`).all()
		).toHaveLength(0);
	});
});
