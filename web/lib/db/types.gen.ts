export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _legacy_users: {
        Row: {
          email: string | null
          full_name: string | null
          imported_at: string | null
          password_hash: string | null
          uptime_user_id: number
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          imported_at?: string | null
          password_hash?: string | null
          uptime_user_id: number
        }
        Update: {
          email?: string | null
          full_name?: string | null
          imported_at?: string | null
          password_hash?: string | null
          uptime_user_id?: number
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          current_user_id: string | null
          device_id: number
          device_type: string | null
          firmware_version: string | null
          hardware_serial: string | null
          id: number
          last_seen_at: string | null
          timezone_offset: number
        }
        Insert: {
          created_at?: string
          current_user_id?: string | null
          device_id: number
          device_type?: string | null
          firmware_version?: string | null
          hardware_serial?: string | null
          id?: number
          last_seen_at?: string | null
          timezone_offset?: number
        }
        Update: {
          created_at?: string
          current_user_id?: string | null
          device_id?: number
          device_type?: string | null
          firmware_version?: string | null
          hardware_serial?: string | null
          id?: number
          last_seen_at?: string | null
          timezone_offset?: number
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          fetched_at: string
          id: number
          key: string
          response_json: string
        }
        Insert: {
          fetched_at?: string
          id?: number
          key: string
          response_json: string
        }
        Update: {
          fetched_at?: string
          id?: number
          key?: string
          response_json?: string
        }
        Relationships: []
      }
      jump_data_points: {
        Row: {
          accel_x: number | null
          accel_y: number | null
          accel_z: number | null
          altitude_above_ground_m: number | null
          altitude_m: number | null
          altitude_m_baro2: number | null
          batt_perc: number | null
          compass_angle: number | null
          device_mode: number | null
          gps_altitude_m: number | null
          gps_angle_deg: number | null
          gps_lat: number | null
          gps_lon: number | null
          gps_sats: number | null
          gps_speed_knot: number | null
          gps_time: number | null
          ground_level_m: number | null
          gyro_x: number | null
          gyro_y: number | null
          gyro_z: number | null
          id: number
          inst_vert_speed_ms: number | null
          jump_id: number
          pressure_pa: number | null
          pressure_pa_baro2: number | null
          sample_ms: number | null
          temperature_c: number | null
          temperature_c_baro2: number | null
        }
        Insert: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          altitude_above_ground_m?: number | null
          altitude_m?: number | null
          altitude_m_baro2?: number | null
          batt_perc?: number | null
          compass_angle?: number | null
          device_mode?: number | null
          gps_altitude_m?: number | null
          gps_angle_deg?: number | null
          gps_lat?: number | null
          gps_lon?: number | null
          gps_sats?: number | null
          gps_speed_knot?: number | null
          gps_time?: number | null
          ground_level_m?: number | null
          gyro_x?: number | null
          gyro_y?: number | null
          gyro_z?: number | null
          id?: number
          inst_vert_speed_ms?: number | null
          jump_id: number
          pressure_pa?: number | null
          pressure_pa_baro2?: number | null
          sample_ms?: number | null
          temperature_c?: number | null
          temperature_c_baro2?: number | null
        }
        Update: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          altitude_above_ground_m?: number | null
          altitude_m?: number | null
          altitude_m_baro2?: number | null
          batt_perc?: number | null
          compass_angle?: number | null
          device_mode?: number | null
          gps_altitude_m?: number | null
          gps_angle_deg?: number | null
          gps_lat?: number | null
          gps_lon?: number | null
          gps_sats?: number | null
          gps_speed_knot?: number | null
          gps_time?: number | null
          ground_level_m?: number | null
          gyro_x?: number | null
          gyro_y?: number | null
          gyro_z?: number | null
          id?: number
          inst_vert_speed_ms?: number | null
          jump_id?: number
          pressure_pa?: number | null
          pressure_pa_baro2?: number | null
          sample_ms?: number | null
          temperature_c?: number | null
          temperature_c_baro2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jump_data_points_jump_id_fkey"
            columns: ["jump_id"]
            isOneToOne: false
            referencedRelation: "jumps"
            referencedColumns: ["id"]
          },
        ]
      }
      jumps: {
        Row: {
          action_type_id: number | null
          canopy_duration_s: number | null
          climb_duration_s: number | null
          created_at: string
          deployment_altitude_m: number | null
          device_id: number | null
          discipline: string | null
          dz_lat: number | null
          dz_lon: number | null
          exit_altitude_m: number | null
          exit_lat: number | null
          exit_lon: number | null
          filename: string
          freefall_duration_s: number | null
          id: number
          is_plane_ride: boolean
          is_public: boolean
          jump_number: number | null
          jumped_at: string | null
          landing_lat: number | null
          landing_lon: number | null
          max_freefall_speed_ms: number | null
          avg_freefall_speed_ms: number | null
          avg_glide_ratio: number | null
          landing_speed_knot: number | null
          opening_peak_g: number | null
          avg_g_force: number | null
          is_swoop: boolean
          swoop_speed_knot: number | null
          max_freefall_horiz_ms: number | null
          avg_freefall_horiz_ms: number | null
          max_canopy_horiz_ms: number | null
          exit_ground_speed_knot: number | null
          exit_distance_m: number | null
          freefall_dist_horiz_m: number | null
          freefall_dist_vert_m: number | null
          canopy_dist_horiz_m: number | null
          canopy_dist_vert_m: number | null
          notes: string | null
          raw_file_storage_key: string | null
          row_count: number | null
          user_id: string
        }
        Insert: {
          action_type_id?: number | null
          canopy_duration_s?: number | null
          climb_duration_s?: number | null
          created_at?: string
          deployment_altitude_m?: number | null
          device_id?: number | null
          discipline?: string | null
          dz_lat?: number | null
          dz_lon?: number | null
          exit_altitude_m?: number | null
          exit_lat?: number | null
          exit_lon?: number | null
          filename: string
          freefall_duration_s?: number | null
          id?: number
          is_plane_ride?: boolean
          is_public?: boolean
          jump_number?: number | null
          jumped_at?: string | null
          landing_lat?: number | null
          landing_lon?: number | null
          max_freefall_speed_ms?: number | null
          avg_freefall_speed_ms?: number | null
          avg_glide_ratio?: number | null
          landing_speed_knot?: number | null
          opening_peak_g?: number | null
          avg_g_force?: number | null
          is_swoop?: boolean | null
          swoop_speed_knot?: number | null
          max_freefall_horiz_ms?: number | null
          avg_freefall_horiz_ms?: number | null
          max_canopy_horiz_ms?: number | null
          exit_ground_speed_knot?: number | null
          exit_distance_m?: number | null
          freefall_dist_horiz_m?: number | null
          freefall_dist_vert_m?: number | null
          canopy_dist_horiz_m?: number | null
          canopy_dist_vert_m?: number | null
          notes?: string | null
          raw_file_storage_key?: string | null
          row_count?: number | null
          user_id: string
        }
        Update: {
          action_type_id?: number | null
          canopy_duration_s?: number | null
          climb_duration_s?: number | null
          created_at?: string
          deployment_altitude_m?: number | null
          device_id?: number | null
          discipline?: string | null
          dz_lat?: number | null
          dz_lon?: number | null
          exit_altitude_m?: number | null
          exit_lat?: number | null
          exit_lon?: number | null
          filename?: string
          freefall_duration_s?: number | null
          id?: number
          is_plane_ride?: boolean
          is_public?: boolean
          jump_number?: number | null
          jumped_at?: string | null
          landing_lat?: number | null
          landing_lon?: number | null
          max_freefall_speed_ms?: number | null
          avg_freefall_speed_ms?: number | null
          avg_glide_ratio?: number | null
          landing_speed_knot?: number | null
          opening_peak_g?: number | null
          avg_g_force?: number | null
          is_swoop?: boolean | null
          swoop_speed_knot?: number | null
          max_freefall_horiz_ms?: number | null
          avg_freefall_horiz_ms?: number | null
          max_canopy_horiz_ms?: number | null
          exit_ground_speed_knot?: number | null
          exit_distance_m?: number | null
          freefall_dist_horiz_m?: number | null
          freefall_dist_vert_m?: number | null
          canopy_dist_horiz_m?: number | null
          canopy_dist_vert_m?: number | null
          notes?: string | null
          raw_file_storage_key?: string | null
          row_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jumps_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      places_cache: {
        Row: {
          fetched_at: string
          id: number
          lat_bucket: number
          lon_bucket: number
          query: string
          response_json: string
        }
        Insert: {
          fetched_at?: string
          id?: number
          lat_bucket: number
          lon_bucket: number
          query: string
          response_json: string
        }
        Update: {
          fetched_at?: string
          id?: number
          lat_bucket?: number
          lon_bucket?: number
          query?: string
          response_json?: string
        }
        Relationships: []
      }
      profiles: {
          Row: {
          altimeter: string
          avatar_url: string | null
          bio: string | null
          burble_name: string | null
          canopy_size: number | null
          canopy_type: string | null
          created_at: string
          email: string | null
          full_name: string | null
          home_dz: string | null
          home_dz_lat: number | null
          home_dz_lon: number | null
          id: string
          is_public: boolean
          next_jump_number: number
          ratings: string | null
          reserve_repack_date: string | null
          rig_type: string | null
          role: string
          theme: string
          units: string
          updated_at: string
          uptime_user_id: number | null
          uspa_license: string | null
          uspa_member_number: string | null
          wing_load: number | null
        }
        Insert: {
          altimeter?: string
          avatar_url?: string | null
          bio?: string | null
          burble_name?: string | null
          canopy_size?: number | null
          canopy_type?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_dz?: string | null
          home_dz_lat?: number | null
          home_dz_lon?: number | null
          id: string
          is_public?: boolean
          next_jump_number?: number
          ratings?: string | null
          reserve_repack_date?: string | null
          rig_type?: string | null
          role?: string
          theme?: string
          units?: string
          updated_at?: string
          uptime_user_id?: number | null
          uspa_license?: string | null
          uspa_member_number?: string | null
          wing_load?: number | null
        }
        Update: {
          altimeter?: string
          avatar_url?: string | null
          bio?: string | null
          burble_name?: string | null
          canopy_size?: number | null
          canopy_type?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_dz?: string | null
          home_dz_lat?: number | null
          home_dz_lon?: number | null
          id?: string
          is_public?: boolean
          next_jump_number?: number
          ratings?: string | null
          reserve_repack_date?: string | null
          rig_type?: string | null
          role?: string
          theme?: string
          units?: string
          updated_at?: string
          uptime_user_id?: number | null
          uspa_license?: string | null
          uspa_member_number?: string | null
          wing_load?: number | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          content: string | null
          device_id: number | null
          id: number
          log_number: number | null
          log_source: string | null
          uploaded_at: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          device_id?: number | null
          id?: number
          log_number?: number | null
          log_source?: string | null
          uploaded_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          device_id?: number | null
          id?: number
          log_number?: number | null
          log_source?: string | null
          uploaded_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          fetched_at: string
          id: number
          key: string
          response_json: string
        }
        Insert: {
          fetched_at?: string
          id?: number
          key: string
          response_json: string
        }
        Update: {
          fetched_at?: string
          id?: number
          key?: string
          response_json?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_jump_analysis: {
        Args: { jump_id: number }
        Returns: undefined
      }
      import_legacy_users: {
        Args: never
        Returns: {
          errored: number
          imported: number
          skipped: number
        }[]
      }
      lat_bucket: { Args: { lat: number }; Returns: number }
      leaderboard: { Args: { period?: string }; Returns: Json }
      lon_bucket: { Args: { lon: number }; Returns: number }
      user_stats: {
        Args: never
        Returns: {
          fastest_ff_jump_id: number
          fastest_freefall_ms: number
          first_jump: string
          highest_exit_jump_id: number
          highest_exit_m: number
          last_jump: string
          total_freefall_s: number
          total_jumps: number
        }[]
      }
      community_stats: {
        Args: never
        Returns: Json
      }
      jump_with_neighbors: {
        Args: { p_jump_id: number }
        Returns: {
          id: number
          filename: string | null
          jumped_at: string | null
          exit_altitude_m: number | null
          deployment_altitude_m: number | null
          freefall_duration_s: number | null
          max_freefall_speed_ms: number | null
          canopy_duration_s: number | null
          climb_duration_s: number | null
          jump_number: number | null
          exit_lat: number | null
          exit_lon: number | null
          notes: string | null
          discipline: string | null
          is_public: boolean | null
          row_count: number | null
          prev_id: number | null
          next_id: number | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
