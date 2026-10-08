import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const hqState = sqliteTable("hq_state", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  schemaVersion: integer("schema_version").notNull().default(1),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
