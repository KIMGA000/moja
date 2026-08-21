// 커뮤니티 게시판 타입 및 익명 신원 관리
// 게시글·댓글은 서버(파일 DB)에 저장, 닉네임은 로그인 없이 브라우저에만 저장

export type Category = "free" | "info" | "counsel" | "question";

export const CATEGORY_LABEL: Record<Category, string> = {
  free: "자유",
  info: "정보공유",
  counsel: "고민상담",
  question: "질문",
};

export const CATEGORY_OPTIONS: Category[] = ["free", "info", "counsel", "question"];

export type Post = {
  id: string;
  category: Category;
  title: string;
  body: string;
  author: string;
  badge: string | null;
  createdAt: number;
  commentCount: number;
};

export type Comment = {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: number;
};

const NICKNAME_STORAGE_KEY = "moja/community-nickname-v1";

const ADJECTIVES = ["든든한", "씩씩한", "반짝이는", "포근한", "용감한", "성실한", "다정한", "꾸준한"];
const NOUNS = ["자립러", "다람쥐", "고양이", "나침반", "새싹", "등대", "여행자", "별빛"];

export function getOrCreateNickname(): string {
  if (typeof window === "undefined") return "익명";
  const saved = localStorage.getItem(NICKNAME_STORAGE_KEY);
  if (saved) return saved;
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  const nickname = `${adj}${noun}${num}`;
  localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  return nickname;
}

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR");
}
