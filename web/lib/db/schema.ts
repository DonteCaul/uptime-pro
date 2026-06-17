import {
  pgSchema,
  text,
  integer,
  bigint,
  numeric,
  smallint,
  boolean,
  timestamp,
  primaryKey,
  serial,
  bigserial,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for UpTime.Pro.
 *
 * All app tables live in a dedicated `app` schema to keep them separate from
 * Supabase's own tables (auth.*, storage.*, realtime.*) in the shared Postgres.
 * The Supabase `Database` type referenced by the Supabase clients is generated
 * from the applied migrations — see lib/db/types.ts.
 *
 * NOTE on tenancy: authorization is enforced by Row-Level Security in the DB
 * (see supabase/migrations/0002_rls_policies.sql), NOT by these definitions.
 * Every user-scoped table below carries a `userId` column that RLS filters on.
 */

export const app = pgSchema("app");

// ─── Profiles ──────────────────────────────────────────────────────────────
// 1:1 with auth.users. Created by trigger on signup (0001_initial_schema.sql).
// Includes the 14 profile columns missing from the original schema.sql.

export const profiles = app.table("profiles", {
  id: uuid("id").primaryKey(), // == auth.users.id
  uptimeUserId: integer("uptime_user_id").unique(), // Dekunu device user ID
  email: text("email").unique(),
  fullName: text("full_name"),
  bio: text("bio"),

  homeDz: text("home_dz"),
  homeDzLat: numeric("home_dz_lat", { precision: 10, scale: 7 }),
  homeDzLon: numeric("home_dz_lon", { precision: 10, scale: 7 }),
  avatarUrl: text("avatar_url"),

  // Credentials / affiliations
  uspaLicense: text("uspa_license"),
  uspaMemberNumber: text("uspa_member_number"),
  burbleName: text("burble_name"),
  ratings: text("ratings"),

  // Gear
  canopySize: integer("canopy_size"),
  wingLoad: numeric("wing_load", { precision: 5, scale: 2 }),
  rigType: text("rig_type"),
  canopyType: text("canopy_type"),
  reserveRepackDate: timestamp("reserve_repack_date", { withTimezone: true }),

  // Visibility + counters + prefs
  isPublic: boolean("is_public").default(false).notNull(),
  nextJumpNumber: integer("next_jump_number").default(1).notNull(),
  units: text("units").default("metric").notNull(), // 'metric' | 'imperial'
  theme: text("theme").default("light").notNull(), // 'light' | 'dark'
  role: text("role").default("user").notNull(), // 'user' | 'admin'

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Devices ───────────────────────────────────────────────────────────────
export const devices = app.table("devices", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").unique().notNull(), // Dekunu device id
  deviceType: text("device_type"),
  hardwareSerial: text("hardware_serial"),
  firmwareVersion: text("firmware_version"),
  timezoneOffset: integer("timezone_offset").default(0).notNull(),
  // Supabase auth uid — text to match auth.users.id type
  currentUserId: text("current_user_id"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Jumps ─────────────────────────────────────────────────────────────────
// `discipline` is a TEXT column (not an id) to preserve the original semantics:
// it stores values like "Belly / RW", "BASE", and the sentinel
// "Rode the plane down". Renamed from `discipline_id` to fix the misnomer.
// `rawFileStorageKey` replaces the old absolute `raw_file_path` now that files
// live in Supabase Storage.

export const jumps = app.table("jumps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // auth.users.id
  deviceId: integer("device_id"),
  jumpNumber: integer("jump_number"),
  filename: text("filename").notNull(),
  jumpedAt: timestamp("jumped_at", { withTimezone: true }),
  actionTypeId: integer("action_type_id"),
  discipline: text("discipline"),

  exitAltitudeM: numeric("exit_altitude_m"),
  deploymentAltitudeM: numeric("deployment_altitude_m"),
  freefallDurationS: numeric("freefall_duration_s"),
  maxFreefallSpeedMs: numeric("max_freefall_speed_ms"),
  canopyDurationS: numeric("canopy_duration_s"),

  exitLat: numeric("exit_lat", { precision: 10, scale: 7 }),
  exitLon: numeric("exit_lon", { precision: 10, scale: 7 }),
  landingLat: numeric("landing_lat", { precision: 10, scale: 7 }),
  landingLon: numeric("landing_lon", { precision: 10, scale: 7 }),
  dzLat: numeric("dz_lat", { precision: 10, scale: 7 }),
  dzLon: numeric("dz_lon", { precision: 10, scale: 7 }),

  notes: text("notes"),
  rawFileStorageKey: text("raw_file_storage_key"),
  rowCount: integer("row_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Jump data points (time-series, the hot table) ─────────────────────────
// Bulk-inserted in batches of 200. 26 numeric sensor columns per row, indexed
// on jump_id, ON DELETE CASCADE so deleting a jump purges its points.

export const jumpDataPoints = app.table("jump_data_points", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jumpId: integer("jump_id")
    .notNull()
    .references(() => jumps.id, { onDelete: "cascade" }),
  sampleMs: bigint("sample_ms", { mode: "number" }),
  deviceMode: smallint("device_mode"),
  gpsTime: bigint("gps_time", { mode: "number" }),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLon: numeric("gps_lon", { precision: 10, scale: 7 }),
  gpsAltitudeM: numeric("gps_altitude_m"),
  gpsSpeedKnot: numeric("gps_speed_knot"),
  gpsAngleDeg: numeric("gps_angle_deg"),
  gpsSats: smallint("gps_sats"),
  pressurePa: numeric("pressure_pa"),
  temperatureC: numeric("temperature_c"),
  altitudeM: numeric("altitude_m"),
  altitudeAboveGroundM: numeric("altitude_above_ground_m"),
  groundLevelM: numeric("ground_level_m"),
  instVertSpeedMs: numeric("inst_vert_speed_ms"),
  compassAngle: numeric("compass_angle"),
  accelX: numeric("accel_x"),
  accelY: numeric("accel_y"),
  accelZ: numeric("accel_z"),
  gyroX: numeric("gyro_x"),
  gyroY: numeric("gyro_y"),
  gyroZ: numeric("gyro_z"),
  battPerc: numeric("batt_perc"),
  pressurePaBaro2: numeric("pressure_pa_baro2"),
  temperatureCBaro2: numeric("temperature_c_baro2"),
  altitudeMBaro2: numeric("altitude_m_baro2"),
});

// ─── System logs (device syslog uploads) ───────────────────────────────────
export const systemLogs = app.table("system_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceId: integer("device_id"),
  userId: text("user_id"),
  logSource: text("log_source"), // 'syslog' | 'syslog_esp32'
  logNumber: integer("log_number"),
  content: text("content"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Caches (server-side only, populated by route handlers) ────────────────
export const placesCache = app.table("places_cache", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  latBucket: integer("lat_bucket").notNull(), // lat * 1000, rounded
  lonBucket: integer("lon_bucket").notNull(), // lon * 1000, rounded
  query: text("query").notNull(),
  responseJson: text("response_json").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.latBucket, t.lonBucket, t.query] })]);

export const geocodeCache = app.table("geocode_cache", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull().unique(), // query string or "lat,lon"
  responseJson: text("response_json").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const weatherCache = app.table("weather_cache", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull().unique(), // "lat,lon,YYYY-MM-DD"
  responseJson: text("response_json").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

// Type helpers — usable in route handlers / server components.
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Jump = typeof jumps.$inferSelect;
export type NewJump = typeof jumps.$inferInsert;
export type JumpDataPoint = typeof jumpDataPoints.$inferSelect;
export type NewJumpDataPoint = typeof jumpDataPoints.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type SystemLog = typeof systemLogs.$inferSelect;
