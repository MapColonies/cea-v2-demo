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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      approval_sessions: {
        Row: {
          last_activity_at: string
          performer_name: string
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          last_activity_at?: string
          performer_name: string
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          last_activity_at?: string
          performer_name?: string
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      model_approval_logs: {
        Row: {
          approved_at: string
          approved_by: string
          id: string
          model_id: string
          notes: string | null
        }
        Insert: {
          approved_at?: string
          approved_by: string
          id?: string
          model_id: string
          notes?: string | null
        }
        Update: {
          approved_at?: string
          approved_by?: string
          id?: string
          model_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_approval_logs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      model_edit_locks: {
        Row: {
          expires_at: string
          last_activity_at: string
          model_id: string
          owner_name: string
          session_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string
          last_activity_at?: string
          model_id: string
          owner_name: string
          session_id: string
          user_id: string
        }
        Update: {
          expires_at?: string
          last_activity_at?: string
          model_id?: string
          owner_name?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_edit_locks_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: true
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      model_status_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          model_id: string
          notes: string | null
          performed_by: string
          performer_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          model_id: string
          notes?: string | null
          performed_by: string
          performer_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          model_id?: string
          notes?: string | null
          performed_by?: string
          performer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_status_logs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      model_subtiles: {
        Row: {
          accuracy: number | null
          approved_at: string | null
          approved_by: string | null
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          capture_date: string | null
          code: string
          created_at: string
          display_id: string | null
          id: string
          is_approved_for_coordinates: boolean
          model_id: string
          name: string | null
          quality_rating: number | null
          updated_at: string
          vertical_accuracy: number | null
        }
        Insert: {
          accuracy?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          capture_date?: string | null
          code: string
          created_at?: string
          display_id?: string | null
          id?: string
          is_approved_for_coordinates?: boolean
          model_id: string
          name?: string | null
          quality_rating?: number | null
          updated_at?: string
          vertical_accuracy?: number | null
        }
        Update: {
          accuracy?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bbox_east?: number
          bbox_north?: number
          bbox_south?: number
          bbox_west?: number
          capture_date?: string | null
          code?: string
          created_at?: string
          display_id?: string | null
          id?: string
          is_approved_for_coordinates?: boolean
          model_id?: string
          name?: string | null
          quality_rating?: number | null
          updated_at?: string
          vertical_accuracy?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_subtiles_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          accuracy: number | null
          approved_at: string | null
          approved_by: string | null
          approved_subtile_count: number
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          capture_date: string | null
          center_lat: number | null
          center_lng: number | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          is_approved_for_coordinates: boolean | null
          is_locked_in_catalog: boolean
          is_published: boolean
          is_rejected: boolean
          name: string
          resolution: number | null
          source: string | null
          thumbnail_url: string | null
          updated_at: string
          upload_date: string | null
          vertical_accuracy: number | null
        }
        Insert: {
          accuracy?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_subtile_count?: number
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          capture_date?: string | null
          center_lat?: number | null
          center_lng?: number | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_approved_for_coordinates?: boolean | null
          is_locked_in_catalog?: boolean
          is_published?: boolean
          is_rejected?: boolean
          name: string
          resolution?: number | null
          source?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          upload_date?: string | null
          vertical_accuracy?: number | null
        }
        Update: {
          accuracy?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_subtile_count?: number
          bbox_east?: number
          bbox_north?: number
          bbox_south?: number
          bbox_west?: number
          capture_date?: string | null
          center_lat?: number | null
          center_lng?: number | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_approved_for_coordinates?: boolean | null
          is_locked_in_catalog?: boolean
          is_published?: boolean
          is_rejected?: boolean
          name?: string
          resolution?: number | null
          source?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          upload_date?: string | null
          vertical_accuracy?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      subtile_approval_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          model_id: string
          notes: string | null
          performed_by: string
          performer_name: string
          subtile_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          model_id: string
          notes?: string | null
          performed_by: string
          performer_name: string
          subtile_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          model_id?: string
          notes?: string | null
          performed_by?: string
          performer_name?: string
          subtile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtile_approval_logs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtile_approval_logs_subtile_id_fkey"
            columns: ["subtile_id"]
            isOneToOne: false
            referencedRelation: "model_subtiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_model_edit_lock: { Args: { _model_id: string }; Returns: Json }
      approval_session_status: { Args: { _touch?: boolean }; Returns: Json }
      end_approval_session: { Args: never; Returns: undefined }
      get_email_by_username: { Args: { _username: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_model_edit_lock: {
        Args: { _model_id: string }
        Returns: undefined
      }
      save_model_workspace: {
        Args: {
          _changes: Json
          _expected_rejected: boolean
          _model_id: string
          _notes?: string
          _performer_name: string
          _rejected: boolean
        }
        Returns: number
      }
      save_subtile_approval_changes: {
        Args: {
          _changes: Json
          _model_id: string
          _notes?: string
          _performer_name: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "viewer"],
    },
  },
} as const
