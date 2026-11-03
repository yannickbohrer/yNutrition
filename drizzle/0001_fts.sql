-- Full-text search over foods.
-- foods_fts: word/prefix search, diacritic-insensitive ("apf" -> "Äpfel", "Apfel").
-- foods_tri: trigram substring search for German compounds ("brot" -> "Vollkornbrot").
CREATE VIRTUAL TABLE `foods_fts` USING fts5(
	name_de, name_en, synonyms, brand,
	content='foods', content_rowid='id',
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `foods_tri` USING fts5(
	name_de, name_en, synonyms, brand,
	content='foods', content_rowid='id',
	tokenize = 'trigram remove_diacritics 1'
);
--> statement-breakpoint
CREATE TRIGGER `foods_ai` AFTER INSERT ON `foods` BEGIN
	INSERT INTO foods_fts(rowid, name_de, name_en, synonyms, brand) VALUES (new.id, new.name_de, new.name_en, new.synonyms, new.brand);
	INSERT INTO foods_tri(rowid, name_de, name_en, synonyms, brand) VALUES (new.id, new.name_de, new.name_en, new.synonyms, new.brand);
END;
--> statement-breakpoint
CREATE TRIGGER `foods_ad` AFTER DELETE ON `foods` BEGIN
	INSERT INTO foods_fts(foods_fts, rowid, name_de, name_en, synonyms, brand) VALUES ('delete', old.id, old.name_de, old.name_en, old.synonyms, old.brand);
	INSERT INTO foods_tri(foods_tri, rowid, name_de, name_en, synonyms, brand) VALUES ('delete', old.id, old.name_de, old.name_en, old.synonyms, old.brand);
END;
--> statement-breakpoint
CREATE TRIGGER `foods_au` AFTER UPDATE OF name_de, name_en, synonyms, brand ON `foods` BEGIN
	INSERT INTO foods_fts(foods_fts, rowid, name_de, name_en, synonyms, brand) VALUES ('delete', old.id, old.name_de, old.name_en, old.synonyms, old.brand);
	INSERT INTO foods_tri(foods_tri, rowid, name_de, name_en, synonyms, brand) VALUES ('delete', old.id, old.name_de, old.name_en, old.synonyms, old.brand);
	INSERT INTO foods_fts(rowid, name_de, name_en, synonyms, brand) VALUES (new.id, new.name_de, new.name_en, new.synonyms, new.brand);
	INSERT INTO foods_tri(rowid, name_de, name_en, synonyms, brand) VALUES (new.id, new.name_de, new.name_en, new.synonyms, new.brand);
END;
