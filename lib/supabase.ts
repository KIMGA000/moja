import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AnnouncementRow = {
  id: number;
  source: string;
  source_id: string;
  serv_nm: string;
  serv_dgst: string | null;
  org: string | null;
  region: string | null;
  target_traits: string | null;
  deadline: string | null;
  link: string | null;
  raw_data: unknown;
  review_status: "pending" | "approved" | "rejected";
  duplicate_of: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  fetched_at: string;
  created_at: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 브라우저/일반 서버 코드에서 쓰는 공개 클라이언트. RLS 때문에 review_status='approved'만 읽힌다.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// 검수·동기화용 관리자 클라이언트. service role 키는 절대 클라이언트로 내려보내면 안 되므로
// API 라우트 등 서버 코드에서만 호출한다.
export function createSupabaseAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았어요.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았어요. .env.local을 확인해주세요.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
