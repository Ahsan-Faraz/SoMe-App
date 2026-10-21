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
          id_photo_id: string | null
          media_deleted_at: string | null
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
          id_photo_id?: string | null
          media_deleted_at?: string | null
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
          id_photo_id?: string | null
          media_deleted_at?: string | null
          message?: string | null
          photo_id?: string | null
          real_name_1?: string | null
          real_name_2?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_chat_fk"
            columns: ["community_id", "chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["community_id", "id"]
          },
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
          {
            foreignKeyName: "applications_id_photo_fk"
            columns: ["community_id", "id_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          community_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          community_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          community_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_community_id_blocked_id_fkey"
            columns: ["community_id", "blocked_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "blocks_community_id_blocker_id_fkey"
            columns: ["community_id", "blocker_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      chat_members: {
        Row: {
          chat_id: string
          community_id: string
          joined_at: string
          last_read_seq: number
          role: string
          user_id: string
          visible_from_seq: number
        }
        Insert: {
          chat_id: string
          community_id: string
          joined_at?: string
          last_read_seq?: number
          role?: string
          user_id: string
          visible_from_seq?: number
        }
        Update: {
          chat_id?: string
          community_id?: string
          joined_at?: string
          last_read_seq?: number
          role?: string
          user_id?: string
          visible_from_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_community_id_chat_id_fkey"
            columns: ["community_id", "chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "chat_members_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      chats: {
        Row: {
          allow_commenting: boolean
          allow_post_editing: boolean
          allow_posting: boolean
          allow_reactions: boolean
          application_text: string | null
          calendar: boolean
          community_id: string
          created_at: string
          created_by: string
          direct_join: boolean
          dm_user_a: string | null
          dm_user_b: string | null
          headline: string | null
          history: boolean
          id: string
          kind: string
          last_message_at: string | null
          last_message_preview: string | null
          last_seq: number
          member_list: boolean
          name: string | null
          require_app_image: boolean
          require_app_names: boolean
          require_app_text: boolean
          state_label_1: string | null
          state_label_2: string | null
          state_label_3: string | null
          visible_in_search: boolean
        }
        Insert: {
          allow_commenting?: boolean
          allow_post_editing?: boolean
          allow_posting?: boolean
          allow_reactions?: boolean
          application_text?: string | null
          calendar?: boolean
          community_id: string
          created_at?: string
          created_by: string
          direct_join?: boolean
          dm_user_a?: string | null
          dm_user_b?: string | null
          headline?: string | null
          history?: boolean
          id?: string
          kind: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_seq?: number
          member_list?: boolean
          name?: string | null
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          state_label_1?: string | null
          state_label_2?: string | null
          state_label_3?: string | null
          visible_in_search?: boolean
        }
        Update: {
          allow_commenting?: boolean
          allow_post_editing?: boolean
          allow_posting?: boolean
          allow_reactions?: boolean
          application_text?: string | null
          calendar?: boolean
          community_id?: string
          created_at?: string
          created_by?: string
          direct_join?: boolean
          dm_user_a?: string | null
          dm_user_b?: string | null
          headline?: string | null
          history?: boolean
          id?: string
          kind?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_seq?: number
          member_list?: boolean
          name?: string | null
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          state_label_1?: string | null
          state_label_2?: string | null
          state_label_3?: string | null
          visible_in_search?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chats_community_id_dm_user_a_fkey"
            columns: ["community_id", "dm_user_a"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "chats_community_id_dm_user_b_fkey"
            columns: ["community_id", "dm_user_b"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "chats_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
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
          domain: string | null
          headline: string
          hero_path: string | null
          id: string
          name: string
          privacy_version: string
          require_age_18: boolean
          require_app_image: boolean
          require_app_names: boolean
          require_app_text: boolean
          require_identity: boolean
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
          domain?: string | null
          headline: string
          hero_path?: string | null
          id?: string
          name: string
          privacy_version?: string
          require_age_18?: boolean
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          require_identity?: boolean
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
          domain?: string | null
          headline?: string
          hero_path?: string | null
          id?: string
          name?: string
          privacy_version?: string
          require_age_18?: boolean
          require_app_image?: boolean
          require_app_names?: boolean
          require_app_text?: boolean
          require_identity?: boolean
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
      group_info_posts: {
        Row: {
          body: string
          chat_id: string
          community_id: string
          headline: string
          n: number
        }
        Insert: {
          body?: string
          chat_id: string
          community_id: string
          headline: string
          n: number
        }
        Update: {
          body?: string
          chat_id?: string
          community_id?: string
          headline?: string
          n?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_info_posts_community_id_chat_id_fkey"
            columns: ["community_id", "chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      member_consents: {
        Row: {
          community_id: string
          given_at: string
          kind: string
          user_id: string
          version: string
        }
        Insert: {
          community_id: string
          given_at?: string
          kind: string
          user_id: string
          version: string
        }
        Update: {
          community_id?: string
          given_at?: string
          kind?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_consents_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
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
      messages: {
        Row: {
          author_id: string
          body: string | null
          chat_id: string
          client_id: string | null
          community_id: string
          created_at: string
          edited_at: string | null
          kind: string
          photo_id: string | null
          reactions: Json
          reply_snippet: string | null
          reply_to_seq: number | null
          seq: number
        }
        Insert: {
          author_id: string
          body?: string | null
          chat_id: string
          client_id?: string | null
          community_id: string
          created_at?: string
          edited_at?: string | null
          kind?: string
          photo_id?: string | null
          reactions?: Json
          reply_snippet?: string | null
          reply_to_seq?: number | null
          seq: number
        }
        Update: {
          author_id?: string
          body?: string | null
          chat_id?: string
          client_id?: string | null
          community_id?: string
          created_at?: string
          edited_at?: string | null
          kind?: string
          photo_id?: string | null
          reactions?: Json
          reply_snippet?: string | null
          reply_to_seq?: number | null
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_community_id_author_id_fkey"
            columns: ["community_id", "author_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "messages_community_id_chat_id_fkey"
            columns: ["community_id", "chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "messages_photo_fk"
            columns: ["community_id", "photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "messages_reply_fk"
            columns: ["chat_id", "reply_to_seq"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["chat_id", "seq"]
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
          comment: string | null
          community_id: string
          created_at: string
          linked_user_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          community_id: string
          created_at?: string
          linked_user_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
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
      reactions: {
        Row: {
          chat_id: string
          community_id: string
          created_at: string
          emoji: string
          seq: number
          user_id: string
        }
        Insert: {
          chat_id: string
          community_id: string
          created_at?: string
          emoji: string
          seq: number
          user_id: string
        }
        Update: {
          chat_id?: string
          community_id?: string
          created_at?: string
          emoji?: string
          seq?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_chat_id_seq_fkey"
            columns: ["chat_id", "seq"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["chat_id", "seq"]
          },
          {
            foreignKeyName: "reactions_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["community_id", "user_id"]
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
      admin_chat: { Args: { p_community: string }; Returns: string }
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
      apply_to_group: {
        Args: { p_application: Json; p_chat: string; p_community: string }
        Returns: string
      }
      chat_header: {
        Args: { p_chat: string; p_community: string }
        Returns: {
          allow_commenting: boolean
          allow_post_editing: boolean
          allow_reactions: boolean
          blocked: boolean
          calendar: boolean
          can_post: boolean
          chat_id: string
          info_headline: string
          kind: string
          last_read_seq: number
          last_seq: number
          manage: boolean
          my_role: string
          name: string
          other_user_id: string
        }[]
      }
      chat_list: {
        Args: { p_community: string; p_limit?: number }
        Returns: {
          chat_id: string
          kind: string
          last_message_at: string
          name: string
          other_icon: string
          other_user_id: string
          preview: string
          unread: number
        }[]
      }
      decide_application: {
        Args: { p_application: string; p_decision: string }
        Returns: Json
      }
      delete_group: {
        Args: { p_chat: string; p_community: string }
        Returns: Json
      }
      delete_message: {
        Args: { p_chat: string; p_community: string; p_seq: number }
        Returns: Json
      }
      edit_message: {
        Args: {
          p_body: string
          p_chat: string
          p_community: string
          p_seq: number
        }
        Returns: undefined
      }
      find_dm: {
        Args: { p_community: string; p_user: string }
        Returns: string
      }
      group_assignments: {
        Args: { p_community: string; p_user: string }
        Returns: Json
      }
      group_card: {
        Args: { p_chat: string; p_community: string }
        Returns: Json
      }
      group_directory: {
        Args: { p_community: string; p_limit?: number }
        Returns: {
          chat_id: string
          direct_join: boolean
          headline: string
          name: string
        }[]
      }
      group_info: {
        Args: { p_chat: string; p_community: string }
        Returns: Json
      }
      group_member: {
        Args: { p_chat: string; p_community: string; p_user: string }
        Returns: Json
      }
      group_roster: {
        Args: { p_applications: boolean; p_chat: string; p_community: string }
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
      group_settings: {
        Args: { p_chat: string; p_community: string }
        Returns: Json
      }
      join_check: {
        Args: { p_community: string; p_email: string; p_username: string }
        Returns: {
          email_exists: boolean
          username_taken: boolean
        }[]
      }
      join_community: {
        Args: { p_community: string; p_consents: Json; p_username: string }
        Returns: undefined
      }
      join_group: {
        Args: { p_chat: string; p_community: string }
        Returns: undefined
      }
      join_notice_due: { Args: { p_email: string }; Returns: boolean }
      leave_chat: {
        Args: { p_chat: string; p_community: string; p_mode: string }
        Returns: Json
      }
      list_messages: {
        Args: {
          p_after?: number
          p_before?: number
          p_chat: string
          p_community: string
          p_limit?: number
        }
        Returns: {
          author_id: string
          author_name: string
          author_status_id: string
          body: string
          client_id: string
          created_at: string
          edited_at: string
          kind: string
          my_reaction: string
          photo: Json
          reactions: Json
          reply_author: string
          reply_snippet: string
          reply_to_seq: number
          seq: number
        }[]
      }
      mark_read: {
        Args: { p_chat: string; p_community: string; p_seq: number }
        Returns: undefined
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
      my_application: { Args: { p_community: string }; Returns: Json }
      open_dm: {
        Args: { p_community: string; p_user: string }
        Returns: string
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
      reaction_details: {
        Args: { p_chat: string; p_community: string; p_seq: number }
        Returns: {
          emoji: string
          user_id: string
          username: string
        }[]
      }
      remove_member: {
        Args: { p_community: string; p_user: string }
        Returns: Json
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
      save_group: {
        Args: { p_chat: string; p_community: string; p_group: Json }
        Returns: string
      }
      save_group_record: {
        Args: {
          p_chat: string
          p_community: string
          p_record: Json
          p_user: string
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
      send_message: {
        Args: {
          p_body: string
          p_chat: string
          p_client_id?: string
          p_community: string
          p_photo?: Json
          p_reply_to?: number
        }
        Returns: Json
      }
      set_group_admin: {
        Args: { p_chat: string; p_community: string; p_user: string }
        Returns: undefined
      }
      set_group_member: {
        Args: {
          p_chat: string
          p_community: string
          p_on: boolean
          p_user: string
        }
        Returns: Json
      }
      set_group_rights: {
        Args: { p_community: string; p_on: boolean; p_user: string }
        Returns: undefined
      }
      set_member_status: {
        Args: { p_community: string; p_status: string; p_user: string }
        Returns: undefined
      }
      set_profile_link: {
        Args: { p_community: string; p_linked: string; p_on: boolean }
        Returns: undefined
      }
      set_profile_link_comment: {
        Args: { p_comment: string; p_community: string; p_linked: string }
        Returns: undefined
      }
      set_reaction: {
        Args: {
          p_chat: string
          p_community: string
          p_emoji: string
          p_seq: number
        }
        Returns: Json
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
