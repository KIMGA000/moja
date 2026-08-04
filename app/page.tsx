export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "72px" }}>🦁</div>
      <h1 style={{ fontSize: "32px", fontWeight: 800 }}>
        첫 화면이 떴습니다!
      </h1>
      <p style={{ fontSize: "18px", color: "#6b7280", lineHeight: 1.7 }}>
        여기까지 왔다면 준비 완료입니다.
        <br />
        이제 Claude Code에게 이 화면을 바꿔 달라고 말해 보세요.
      </p>
      <div
        style={{
          background: "#ffffff",
          border: "2px solid #f97316",
          borderRadius: "12px",
          padding: "20px 28px",
          maxWidth: "520px",
        }}
      >
        <p style={{ fontSize: "15px", color: "#9a3412", fontWeight: 700 }}>
          이렇게 지시해 보세요
        </p>
        <p style={{ fontSize: "16px", marginTop: "8px" }}>
          &ldquo;첫 화면의 제목을 우리 팀 이름으로 바꿔 줘&rdquo;
        </p>
      </div>
    </main>
  );
}
