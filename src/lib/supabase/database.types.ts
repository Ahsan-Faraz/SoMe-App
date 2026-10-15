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
      admin_records: {
        Row: {
          community_id: string
          notes: string | null
          real_name_1: string | null
          real_name_2: string | null
          scope_id: string
          state_1: number | null
          state_2: number | null
          state_3: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          community_id: string
          notes?: string | null
          real_name_1?: string | null
          real_name_2?: string | null
          scope_id: string
          state_1?: number | null
          state_2?: number | null
          state_3?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          community_id?: string
          notes?: string | null
          real_name_1?: string | null
          real_name_2?: string | null
          scope_id?: string
          state_1?: number | null
          state_2?: number | null
          state_3?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_records_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      applications: {
        Row: {
          chat_id: string | null
          community_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          photo_id: string | null
          real_name_1: string | null
          real_name_2: string | null
          status: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          community_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          photo_id?: string | null
          real_name_1?: string | null
          real_name_2?: string | null
          status?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          community_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          photo_id?: string | null
          real_name_1?: string | null
          real_name_2?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_community_id_photo_id_fkey"
            columns: ["community_id", "photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "applications_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
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
          show_age: boolean
          show_country: boolean
          show_district: boolean
          show_links: boolean
          show_looking_for: boolean
          show_photo: boolean
          show_place: boolean
          show_score: boolean
          show_visibility: boolean
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
          show_age?: boolean
          show_country?: boolean
          show_district?: boolean
          show_links?: boolean
          show_looking_for?: boolean
          show_photo?: boolean
          show_place?: boolean
          show_score?: boolean
          show_visibility?: boolean
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
          show_age?: boolean
          show_country?: boolean
          show_district?: boolean
          show_links?: boolean
          show_looking_for?: boolean
          show_photo?: boolean
          show_place?: boolean
          show_score?: boolean
          show_visibility?: boolean
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
          parent_id: string | null
          position: number
        }
        Insert: {
          active?: boolean
          community_id: string
          created_at?: string
          id?: string
          label: Json
          list: string
          parent_id?: string | null
          position: number
        }
        Update: {
          active?: boolean
          community_id?: string
          created_at?: string
          id?: string
          label?: Json
          list?: string
          parent_id?: string | null
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
          {
            foreignKeyName: "community_options_parent_fk"
            columns: ["community_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      members: {
        Row: {
          can_create_groups: boolean
          community_id: string
          country_id: string | null
          created_at: string
          district_id: string | null
          is_system: boolean
          last_login_at: string | null
          locale: string | null
          looking_for: string[]
          photo_id: string | null
          place: string | null
          role: string
          score: number
          state: string
          status_id: string | null
          user_id: string
          username: string
          visible_in_search: boolean
        }
        Insert: {
          can_create_groups?: boolean
          community_id: string
          country_id?: string | null
          created_at?: string
          district_id?: string | null
          is_system?: boolean
          last_login_at?: string | null
          locale?: string | null
          looking_for?: string[]
          photo_id?: string | null
          place?: string | null
          role?: string
          score?: number
          state?: string
          status_id?: string | null
          user_id: string
          username: string
          visible_in_search?: boolean
        }
        Update: {
          can_create_groups?: boolean
          community_id?: string
          country_id?: string | null
          created_at?: string
          district_id?: string | null
          is_system?: boolean
          last_login_at?: string | null
          locale?: string | null
          looking_for?: string[]
          photo_id?: string | null
          place?: string | null
          role?: string
          score?: number
          state?: string
          status_id?: string | null
          user_id?: string
          username?: string
          visible_in_search?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_country_fk"
            columns: ["community_id", "country_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "members_district_fk"
            columns: ["community_id", "district_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "members_photo_fk"
            columns: ["community_id", "photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "members_status_fk"
            columns: ["community_id", "status_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      photos: {
        Row: {
          bucket: string
          community_id: string
          created_at: string
          height: number | null
          id: string
          owner_id: string
          path: string
          purpose: string
          taken_at: string | null
          taken_in_app: boolean
          thumb_path: string
          width: number | null
        }
        Insert: {
          bucket: string
          community_id: string
          created_at?: string
          height?: number | null
          id?: string
          owner_id: string
          path: string
          purpose: string
          taken_at?: string | null
          taken_in_app?: boolean
          thumb_path: string
          width?: number | null
        }
        Update: {
          bucket?: string
          community_id?: string
          created_at?: string
          height?: number | null
          id?: string
          owner_id?: string
          path?: string
          purpose?: string
          taken_at?: string | null
          taken_in_app?: boolean
          thumb_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_community_id_owner_id_fkey"
            columns: ["community_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
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
          for_substatuses: string[] | null
          id: string
          key: string
          kind: string
          label: Json
          max_length: number | null
          on_card: boolean
          position: number
          required: boolean
          searchable: boolean
        }
        Insert: {
          active?: boolean
          community_id: string
          created_at?: string
          for_statuses?: string[] | null
          for_substatuses?: string[] | null
          id?: string
          key: string
          kind: string
          label: Json
          max_length?: number | null
          on_card?: boolean
          position: number
          required?: boolean
          searchable?: boolean
        }
        Update: {
          active?: boolean
          community_id?: string
          created_at?: string
          for_statuses?: string[] | null
          for_substatuses?: string[] | null
          id?: string
          key?: string
          kind?: string
          label?: Json
          max_length?: number | null
          on_card?: boolean
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
      profile_layout: {
        Row: {
          builtin: string
          community_id: string
          position: number
        }
        Insert: {
          builtin: string
          community_id: string
          position: number
        }
        Update: {
          builtin?: string
          community_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_layout_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_links: {
        Row: {
          community_id: string
          created_at: string
          linked_user_id: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          linked_user_id: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          linked_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_links_community_id_linked_user_id_fkey"
            columns: ["community_id", "linked_user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "profile_links_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      profile_people: {
        Row: {
          birth_date: string
          community_id: string
          n: number
          substatus_id: string | null
          user_id: string
        }
        Insert: {
          birth_date: string
          community_id: string
          n: number
          substatus_id?: string | null
          user_id: string
        }
        Update: {
          birth_date?: string
          community_id?: string
          n?: number
          substatus_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_people_community_id_substatus_id_fkey"
            columns: ["community_id", "substatus_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "profile_people_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      profile_value_options: {
        Row: {
          community_id: string
          field_id: string
          n: number
          option_id: string
          substatus_id: string | null
          user_id: string
        }
        Insert: {
          community_id: string
          field_id: string
          n?: number
          option_id: string
          substatus_id?: string | null
          user_id: string
        }
        Update: {
          community_id?: string
          field_id?: string
          n?: number
          option_id?: string
          substatus_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_value_options_community_id_field_id_fkey"
            columns: ["community_id", "field_id"]
            isOneToOne: false
            referencedRelation: "profile_fields"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "profile_value_options_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "profile_value_options_field_id_option_id_fkey"
            columns: ["field_id", "option_id"]
            isOneToOne: false
            referencedRelation: "profile_field_options"
            referencedColumns: ["field_id", "id"]
          },
          {
            foreignKeyName: "profile_value_options_substatus_fk"
            columns: ["community_id", "substatus_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      profile_values: {
        Row: {
          community_id: string
          field_id: string
          n: number
          substatus_id: string | null
          user_id: string
          value_bool: boolean | null
          value_date: string | null
          value_num: number | null
          value_photo_id: string | null
          value_text: string | null
        }
        Insert: {
          community_id: string
          field_id: string
          n?: number
          substatus_id?: string | null
          user_id: string
          value_bool?: boolean | null
          value_date?: string | null
          value_num?: number | null
          value_photo_id?: string | null
          value_text?: string | null
        }
        Update: {
          community_id?: string
          field_id?: string
          n?: number
          substatus_id?: string | null
          user_id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_num?: number | null
          value_photo_id?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_values_community_id_field_id_fkey"
            columns: ["community_id", "field_id"]
            isOneToOne: false
            referencedRelation: "profile_fields"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "profile_values_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "profile_values_community_id_value_photo_id_fkey"
            columns: ["community_id", "value_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "profile_values_substatus_fk"
            columns: ["community_id", "substatus_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      status_slots: {
        Row: {
          community_id: string
          count: number
          position: number
          status_id: string
          substatus_id: string
        }
        Insert: {
          community_id: string
          count: number
          position: number
          status_id: string
          substatus_id: string
        }
        Update: {
          community_id?: string
          count?: number
          position?: number
          status_id?: string
          substatus_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_slots_community_id_status_id_fkey"
            columns: ["community_id", "status_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "status_slots_community_id_substatus_id_fkey"
            columns: ["community_id", "substatus_id"]
            isOneToOne: false
            referencedRelation: "community_options"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_profile_photo: {
        Args: { p_community: string; p_photo: Json; p_slot: Json }
        Returns: Json
      }
      admin_member: {
        Args: { p_community: string; p_user: string }
        Returns: Json
      }
      admin_roster: {
        Args: { p_applications: boolean; p_community: string }
        Returns: {
          application_id: string
          message: string
          notes: string
          real_name_1: string
          real_name_2: string
          state_1: number
          state_2: number
          state_3: number
          status_id: string
          user_id: string
          username: string
        }[]
      }
      decide_application: {
        Args: { p_application: string; p_decision: string }
        Returns: Json
      }
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
      member_names: {
        Args: { p_community: string; p_limit?: number; p_query: string }
        Returns: {
          icon: string
          user_id: string
          username: string
        }[]
      }
      profile: { Args: { p_community: string; p_user: string }; Returns: Json }
      profile_cards: {
        Args: {
          p_after_score?: number
          p_after_user?: string
          p_community: string
          p_limit?: number
        }
        Returns: {
          ages: number[]
          country_id: string
          district_id: string
          looking_for: string[]
          photo_taken_in_app: boolean
          photo_thumb: string
          place: string
          score: number
          status_id: string
          user_id: string
          username: string
        }[]
      }
      remove_member: {
        Args: { p_community: string; p_user: string }
        Returns: undefined
      }
      remove_profile_photo: {
        Args: { p_community: string; p_photo: string }
        Returns: Json
      }
      reorder_profile_layout: {
        Args: { p_community: string; p_items: string[] }
        Returns: undefined
      }
      save_admin_record: {
        Args: { p_community: string; p_record: Json; p_user: string }
        Returns: undefined
      }
      save_community_options: {
        Args: {
          p_community: string
          p_items: Json
          p_list: string
          p_parent?: string
        }
        Returns: undefined
      }
      save_profile: {
        Args: { p_community: string; p_profile: Json; p_values?: Json }
        Returns: Json
      }
      save_profile_builtins: {
        Args: { p_community: string; p_settings: Json }
        Returns: undefined
      }
      save_profile_field: {
        Args: { p_community: string; p_field: Json; p_options?: Json }
        Returns: string
      }
      set_member_status: {
        Args: { p_community: string; p_status: string; p_user: string }
        Returns: undefined
      }
      set_profile_link: {
        Args: { p_community: string; p_linked: string; p_on: boolean }
        Returns: undefined
      }
      submit_application: {
        Args: { p_application: Json; p_community: string }
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
