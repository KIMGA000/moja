"use client";

import { supabase } from "./supabase";

export function bookmarkKey(source: string, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export async function listBookmarkKeys(userId: string): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from("bookmarks").select("source, source_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => bookmarkKey(row.source, row.source_id)));
}

// 생년월일로 만 나이를 계산한다 — 정확한 생년월일이 아니라 정수 나이 하나만 bookmarks에 남기려고.
export function calcAgeFromBirthDate(birthDate: string, todayIso: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date(todayIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(today.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export async function addBookmark(source: string, sourceId: string, ageAtAction?: number | null): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("bookmarks")
    .insert({ source, source_id: sourceId, age_at_action: ageAtAction ?? null });
  if (error) throw new Error(error.message);
}

export async function removeBookmark(source: string, sourceId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("bookmarks").delete().eq("source", source).eq("source_id", sourceId);
  if (error) throw new Error(error.message);
}

// 어떤 공고가 인기 있는지 집계하기 위한 익명 클릭 로그. 실패해도 사용자 경험에 영향 없어야
// 하니 에러를 흡수한다 (링크 이동 자체는 항상 되게).
export function logAnnouncementClick(source: string, sourceId: string): void {
  if (!supabase) return;
  supabase
    .from("announcement_clicks")
    .insert({ source, source_id: sourceId })
    .then(() => {});
}
