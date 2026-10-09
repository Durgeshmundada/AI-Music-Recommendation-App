import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  fileBytes: integer('file_bytes').notNull(),
  fileHash: text('file_hash'),
  state: text('state').notNull().default('uploading'),
  songJson: text('song_json'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('idx_uploads_owner_state').on(t.ownerId, t.state), uniqueIndex('idx_uploads_owner_hash').on(t.ownerId, t.fileHash)]);

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, (t) => [index('idx_playlists_owner').on(t.ownerId)]);

export const playlistSongs = sqliteTable('playlist_songs', {
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  songId: text('song_id').notNull(), position: integer('position').notNull(),
}, (t) => [primaryKey({ columns: [t.playlistId, t.songId] }), index('idx_playlist_songs_order').on(t.playlistId, t.position)]);

export const history = sqliteTable('listening_history', {
  userId: text('user_id').notNull(), songId: text('song_id').notNull(),
  playedAt: integer('played_at').notNull(), resumeSeconds: integer('resume_seconds').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.songId] }), index('idx_history_user_time').on(t.userId, t.playedAt)]);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
}, (t) => [index('idx_rate_limits_expiry').on(t.expiresAt)]);

export const removedCatalog = sqliteTable('removed_catalog', {
  songId: text('song_id').primaryKey(), deletedBy: text('deleted_by').notNull(), deletedAt: integer('deleted_at').notNull(),
});
