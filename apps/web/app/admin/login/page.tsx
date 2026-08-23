"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 검수 화면 접근 게이트. 팀 공용 접근 코드를 받아 httpOnly 쿠키를 굽는다.
 * ⚠️ 해커톤 수준 구현 — middleware.ts 주석 참고.
 */
export default function AdminLoginPage() {
  // useSearchParams()는 CSR bailout이라 Suspense 경계가 없으면 프로덕션 빌드(next build)가
  // 정적 프리렌더링 단계에서 실패한다 — 화면 자체는 그대로 두고 경계만 감싼다.
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/admin/queue";

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, reviewer: name }),
    });
    setBusy(false);
    if (res.ok) router.push(nextPath);
    else setError("접근 코드가 맞지 않아요.");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: '-apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        background: "#F1F1F1",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "28px 24px",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#111" }}>검수자 로그인</h1>
        <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "8px", lineHeight: 1.6 }}>
          공고 검수 화면은 팀 내부용이에요. 접근 코드를 입력해주세요.
        </p>

        <label style={{ display: "block", fontSize: "12px", color: "#6B7280", marginTop: "20px" }}>
          검수자 이름
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="검수 기록에 남을 이름"
          required
          style={inputStyle}
        />

        <label style={{ display: "block", fontSize: "12px", color: "#6B7280", marginTop: "12px" }}>
          접근 코드
        </label>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          style={inputStyle}
        />

        {error && (
          <p style={{ marginTop: "12px", fontSize: "13px", color: "#8A2C2C" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "14px",
            borderRadius: "999px",
            border: "none",
            background: busy ? "#9CA3AF" : "#111",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "확인 중…" : "들어가기 →"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "6px",
  padding: "12px 14px",
  border: "1.5px solid #E5E7EB",
  borderRadius: "12px",
  fontSize: "14px",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
