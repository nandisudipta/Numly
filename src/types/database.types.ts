export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: any[]
      }
      businesses: {
        Row: {
          id: string
          name: string
          description: string | null
          invite_code: string | null
          owner_id: string
          logo_url: string | null
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          invite_code?: string | null
          owner_id: string
          logo_url?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          invite_code?: string | null
          owner_id?: string
          logo_url?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: any[]
      }
      book_members: {
        Row: {
          id: string
          book_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          book_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: any[]
      }
      business_members: {
        Row: {
          id: string
          business_id: string
          user_id: string
          role: 'captain' | 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          invited_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          business_id: string
          user_id: string
          role: 'captain' | 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          invited_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          user_id?: string
          role?: 'captain' | 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          invited_by?: string | null
          joined_at?: string
        }
        Relationships: any[]
      }
      business_invitations: {
        Row: {
          id: string
          business_id: string
          email: string
          role: 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          token: string
          invited_by: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          email: string
          role?: 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          token?: string
          invited_by: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          email?: string
          role?: 'vice_captain' | 'team_member' | 'viewer' | 'data_entry'
          token?: string
          invited_by?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: any[]
      }
      books: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          image_url: string | null
          color: string | null
          created_by: string
          created_at: string
          updated_at: string
          position: number
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          description?: string | null
          image_url?: string | null
          color?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          position?: number
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          color?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          position?: number
        }
        Relationships: any[]
      }
      ledgers: {
        Row: {
          id: string
          book_id: string
          name: string
          unit_type: string
          category_required: boolean
          categories: string[] | null
          business_id: string
          ledger_locked_until_date: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          book_id: string
          name: string
          unit_type: string
          category_required?: boolean
          categories?: string[] | null
          business_id: string
          ledger_locked_until_date?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          name?: string
          unit_type?: string
          category_required?: boolean
          categories?: string[] | null
          business_id?: string
          ledger_locked_until_date?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: any[]
      }
      ledger_members: {
        Row: {
          id: string
          ledger_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          ledger_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          ledger_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_members_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          ledger_id: string
          amount: number
          type: 'cash_in' | 'cash_out'
          category: string | null
          note: string | null
          attachment_url: string | null
          transaction_date: string
          created_by: string
          created_at: string
          updated_at: string
          business_id: string
          book_id: string
          is_deleted: boolean
        }
        Insert: {
          id?: string
          ledger_id: string
          amount: number
          type: 'cash_in' | 'cash_out'
          category?: string | null
          note?: string | null
          attachment_url?: string | null
          transaction_date?: string
          created_by: string
          created_at?: string
          updated_at?: string
          business_id: string
          book_id: string
          is_deleted?: boolean
        }
        Update: {
          id?: string
          ledger_id?: string
          amount?: number
          type?: 'cash_in' | 'cash_out'
          category?: string | null
          note?: string | null
          attachment_url?: string | null
          transaction_date?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          business_id?: string
          book_id?: string
          is_deleted?: boolean
        }
        Relationships: any[]
      }
      ledger_daily_balance: {
        Row: {
          id: string
          ledger_id: string
          date: string
          total_in: number
          total_out: number
          closing_balance: number
          created_at: string
        }
        Insert: {
          id?: string
          ledger_id: string
          date: string
          total_in?: number
          total_out?: number
          closing_balance?: number
          created_at?: string
        }
        Update: {
          id?: string
          ledger_id?: string
          date?: string
          total_in?: number
          total_out?: number
          closing_balance?: number
          created_at?: string
        }
        Relationships: any[]
      }
      activity_log: {
        Row: {
          id: string
          business_id: string
          action: string
          entity_type: string
          entity_id: string
          old_value: Json | null
          new_value: Json | null
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          action: string
          entity_type: string
          entity_id: string
          old_value?: Json | null
          new_value?: Json | null
          performed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          action?: string
          entity_type?: string
          entity_id?: string
          old_value?: Json | null
          new_value?: Json | null
          performed_by?: string | null
          created_at?: string
        }
        Relationships: any[]
      }
    }
    Views: Record<string, never>
    Functions: {
      get_user_businesses_with_roles: {
        Args: Record<string, never>
        Returns: {
          id: string
          name: string
          created_at: string
          owner_id: string
          member_count: number
          user_role: string
        }[]
      }
      accept_business_invitation: {
        Args: { invite_token: string }
        Returns: Json
      }
      regenerate_invite_code: {
        Args: { business_id: string }
        Returns: Json
      }
      join_business_with_code: {
        Args: { code: string }
        Returns: Json
      }
      get_user_role_in_business: {
        Args: { business_uuid: string; user_uuid: string }
        Returns: string
      }
      is_captain: {
        Args: { business_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_captain_or_vice: {
        Args: { business_uuid: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}
