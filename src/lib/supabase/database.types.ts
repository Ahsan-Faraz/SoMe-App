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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      communities: {
        Row: {
          about: string[]
          about_path: string | null
          application_text: string | null
          created_at: string
          default_locale: string
          headline: string
          hero_path: string | null
          id: string
          name: string
          require_app_image: boolean
          require_app_names: boolean
          require_app_text: boolean
          slug: string
          state_label_1: string | null
          state_label_2: string | null
          state_label_3: string | null
        }
        Insert: {
          about?: string[]
          about_path?: string | null
          application_text?: string | null
          created_at?: string
          default_locale?: string
          headline: string
          hero_path?: string | null
          id?: string
          name: string
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          slug: string
          state_label_1?: string | null
          state_label_2?: string | null
          state_label_3?: string | null
        }
        Update: {
          about?: string[]
          about_path?: string | null
          application_text?: string | null
          created_at?: string
          default_locale?: string
          headline?: string
          hero_path?: string | null
          id?: string
          name?: string
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          slug?: string
          state_label_1?: string | null
          state_label_2?: string | null
          state_label_3?: string | null
        }
        Relationships: []
      }
      community_options: {
        Row: {
          active: boolean
          community_id: string
          created_at: string
          id: string
          label: Json
          list: string
          people: number
          position: number
        }
        Insert: {
          active?: boolean
          community_id: string
          created_at?: string
          id?: string
          label: Json
          list: string
          people?: number
          position: number
        }
        Update: {
          active?: boolean
          community_id?: string
          created_at?: string
          id?: string
          label?: Json
          list?: string
          people?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_options_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          can_create_groups: boolean
          community_id: string
          created_at: string
          is_system: boolean
          last_login_at: string | null
          locale: string | null
          role: string
          state: string
          user_id: string
          username: string
        }
        Insert: {
          can_create_groups?: boolean
          community_id: string
          created_at?: string
          is_system?: boolean
          last_login_at?: string | null
          locale?: string | null
          role?: string
          state?: string
          user_id: string
          username: string
        }
        Update: {
          can_create_groups?: boolean
          community_id?: string
          created_at?: string
          is_system?: boolean
          last_login_at?: string | null
          locale?: string | null
          role?: string
          state?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      profile_field_options: {
        Row: {
          active: boolean
          community_id: string
          created_at: string
          field_id: string
          id: string
          label: Json
          position: number
        }
        Insert: {
          active?: boolean
          community_id: string
          created_at?: string
          field_id: string
          id?: string
          label: Json
          position: number
        }
        Update: {
          active?: boolean
          community_id?: string
          created_at?: string
          field_id?: string
          id?: string
          label?: Json
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_options_community_id_field_id_fkey"
            columns: ["community_id", "field_id"]
            isOneToOne: false
            referencedRelation: "profile_fields"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      profile_fields: {
        Row: {
          active: boolean
          community_id: string
          created_at: string
          for_statuses: string[] | null
          id: string
          key: string
          kind: string
          label: Json
          max_length: number | null
          on_card: boolean
          per_person: boolean
          position: number
          required: boolean
          searchable: boolean
        }
        Insert: {
          active?: boolean
          community_id: string
          created_at?: string
          for_statuses?: string[] | null
          id?: string
          key: string
          kind: string
          label: Json
          max_length?: number | null
          on_card?: boolean
          per_person?: boolean
          position: number
          required?: boolean
          searchable?: boolean
        }
        Update: {
          active?: boolean
          community_id?: string
          created_at?: string
          for_statuses?: string[] | null
          id?: string
          key?: string
          kind?: string
          label?: Json
          max_length?: number | null
          on_card?: boolean
          per_person?: boolean
          position?: number
          required?: boolean
          searchable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_fields_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      join_check: {
        Args: { p_community: string; p_email: string; p_username: string }
        Returns: {
          email_exists: boolean
          username_taken: boolean
        }[]
      }
      member_email: {
        Args: { p_community: string; p_username: string }
        Returns: string
      }
      reorder_profile_fields: {
        Args: { p_community: string; p_ids: string[] }
        Returns: undefined
      }
      save_community_options: {
        Args: { p_community: string; p_items: Json; p_list: string }
        Returns: undefined
      }
      save_profile_field: {
        Args: { p_community: string; p_field: Json; p_options?: Json }
        Returns: string
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
    Enums: {},
  },
} as const
