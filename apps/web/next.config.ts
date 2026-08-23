import type { NextConfig } from "next";

// @moja/core는 빌드된 결과물이 없는 워크스페이스 패키지라(소스 .ts를 그대로 참조),
// Next가 이 패키지도 앱 코드와 같은 방식으로 트랜스파일하도록 명시해야 한다.
// 안 하면 "@moja/core" import에서 알 수 없는 파일 형식 에러가 난다.
const nextConfig: NextConfig = {
  transpilePackages: ["@moja/core"],
};

export default nextConfig;
