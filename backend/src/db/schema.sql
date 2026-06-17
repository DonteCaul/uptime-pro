-- UpTime.Pro database schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  uptime_user_id INTEGER UNIQUE NOT NULL,
  full_name     TEXT,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  next_jump_number INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id                    SERIAL PRIMARY KEY,
  device_id             INTEGER UNIQUE NOT NULL,
  device_type           TEXT,
  hardware_serial       TEXT,
  firmware_version      TEXT,
  timezone_offset       INTEGER DEFAULT 0,
  current_user_id       INTEGER REFERENCES users(id),
  last_seen_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jumps (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  device_id           INTEGER REFERENCES devices(id),
  jump_number         INTEGER,
  filename            TEXT NOT NULL,
  jumped_at           TIMESTAMPTZ,
  action_type_id      INTEGER,
  discipline_id       INTEGER,
  exit_altitude_m     NUMERIC,
  deployment_altitude_m NUMERIC,
  freefall_duration_s NUMERIC,
  max_freefall_speed_ms NUMERIC,
  canopy_duration_s   NUMERIC,
  exit_lat            NUMERIC,
  exit_lon            NUMERIC,
  landing_lat         NUMERIC,
  landing_lon         NUMERIC,
  dz_lat              NUMERIC,
  dz_lon              NUMERIC,
  dropzone_id         INTEGER,
  notes               TEXT,
  raw_file_path       TEXT,
  row_count           INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Raw per-second sensor data for each jump
CREATE TABLE IF NOT EXISTS jump_data_points (
  id                          BIGSERIAL PRIMARY KEY,
  jump_id                     INTEGER NOT NULL REFERENCES jumps(id) ON DELETE CASCADE,
  sample_ms                   BIGINT,
  device_mode                 SMALLINT,
  gps_time                    BIGINT,
  gps_lat                     NUMERIC,
  gps_lon                     NUMERIC,
  gps_altitude_m              NUMERIC,
  gps_speed_knot              NUMERIC,
  gps_angle_deg               NUMERIC,
  gps_sats                    SMALLINT,
  pressure_pa                 NUMERIC,
  temperature_c               NUMERIC,
  altitude_m                  NUMERIC,
  altitude_above_ground_m     NUMERIC,
  ground_level_m              NUMERIC,
  inst_vert_speed_ms          NUMERIC,
  compass_angle               NUMERIC,
  accel_x                     NUMERIC,
  accel_y                     NUMERIC,
  accel_z                     NUMERIC,
  gyro_x                      NUMERIC,
  gyro_y                      NUMERIC,
  gyro_z                      NUMERIC,
  batt_perc                   NUMERIC,
  pressure_pa_baro2           NUMERIC,
  temperature_c_baro2         NUMERIC,
  altitude_m_baro2            NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_jump_data_points_jump_id ON jump_data_points(jump_id);
CREATE INDEX IF NOT EXISTS idx_jumps_user_id ON jumps(user_id);
CREATE INDEX IF NOT EXISTS idx_jumps_jumped_at ON jumps(jumped_at);

-- System logs from device syslog files
CREATE TABLE IF NOT EXISTS system_logs (
  id          BIGSERIAL PRIMARY KEY,
  device_id   INTEGER REFERENCES devices(id),
  user_id     INTEGER REFERENCES users(id),
  log_source  TEXT,   -- 'syslog' or 'syslog_esp32'
  log_number  INTEGER,
  content     TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
