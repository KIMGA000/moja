"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  API_SAMPLE_ITEMS,
  SOURCE_LABEL,
  type AnnouncementRecord,
  type WelfareItem,
  type WelfareSource,
} from "./data/apiPreview";
import { EMPTY_PROFILE, type OnboardingProfile } from "./data/eligibility";
import {
  EligibilityOnboarding,
  EligibilityResultScreen,
} from "./components/EligibilityFlow";
import { AuthBar } from "./components/AuthBar";
import { getNickname, useAuthSession } from "./hooks/useAuthSession";
import {
  addBookmark,
  bookmarkKey,
  calcAgeFromBirthDate,
  listBookmarkKeys,
  logAnnouncementClick,
  removeBookmark,
} from "../lib/bookmarks";
import { supabase } from "../lib/supabase";
import {
  CARD_STYLE,
  COLORS,
  GHOST_BUTTON_ON_CARD,
  GHOST_BUTTON_ON_DARK,
  PRIMARY_BUTTON,
  pillBadge,
} from "./theme";

type Screen = "landing" | "apiPreview" | "eligOnboarding" | "eligResult";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");

  const [apiFilteredItems, setApiFilteredItems] = useState<
    WelfareItem[] | null
  >(null);
  const [apiYouthItems, setApiYouthItems] = useState<WelfareItem[] | null>(
    null,
  );
  const [apiAllItems, setApiAllItems] = useState<WelfareItem[] | null>(null);
  const [apiViewMode, setApiViewMode] = useState<
    "careLeaver" | "youth" | "all"
  >("careLeaver");
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiIsFallback, setApiIsFallback] = useState(false);
  const [apiCounts, setApiCounts] = useState<Record<
    WelfareSource,
    {
      totalCount: number;
      fetchedCount: number;
      filteredCount: number;
      youthCount: number;
    }
  > | null>(null);
  const [apiSelectedSource, setApiSelectedSource] =
    useState<WelfareSource | null>(null);

  const [eligProfile, setEligProfile] =
    useState<OnboardingProfile>(EMPTY_PROFILE);
  const [eligItems, setEligItems] = useState<AnnouncementRecord[] | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [eligError, setEligError] = useState<string | null>(null);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { session } = useAuthSession();
  const [savedProfile, setSavedProfile] = useState<OnboardingProfile | null>(null);

  // 로그인한 사용자는 계정에 저장된 온보딩 답변이 있으면 매번 다시 입력하지 않아도 되도록,
  // 로그인 시 저장된 자격 진단 프로필을 불러와둔다. 신원인증이 아니라 "같은 사람 것" 확인용
  // 로그인이라, 로그인 안 해도 정밀 진단 자체는 그대로 가능하다.
  useEffect(() => {
    if (!session || !supabase) {
      setSavedProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("onboarding_profile")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        const profile = data?.onboarding_profile as OnboardingProfile | null | undefined;
        if (profile) {
          setSavedProfile(profile);
          setEligProfile(profile);
          ensureEligDataLoaded();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) {
      setBookmarkedKeys(new Set());
      return;
    }
    listBookmarkKeys(session.user.id).then(setBookmarkedKeys);
  }, [session]);

  const toggleBookmark = (source: string, sourceId: string) => {
    const key = bookmarkKey(source, sourceId);
    const wasBookmarked = bookmarkedKeys.has(key);
    setBookmarkedKeys((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(key);
      else next.add(key);
      return next;
    });
    const age = calcAgeFromBirthDate(eligProfile.birthDate, todayIso);
    (wasBookmarked ? removeBookmark(source, sourceId) : addBookmark(source, sourceId, age)).catch(() => {
      // 실패하면 낙관적 업데이트를 되돌린다.
      setBookmarkedKeys((prev) => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(key);
        else next.delete(key);
        return next;
      });
    });
  };

  const restart = () => {
    setEligProfile(savedProfile ?? EMPTY_PROFILE);
    setScreen("landing");
  };

  const ensureApiDataLoaded = () => {
    if (apiFilteredItems !== null || apiLoading) return;
    setApiLoading(true);
    setApiError(null);
    fetch("/api/welfare")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "API 호출에 실패했어요.");
        setApiFilteredItems(data.filteredItems as WelfareItem[]);
        setApiYouthItems(data.youthItems as WelfareItem[]);
        setApiAllItems(data.allItems as WelfareItem[]);
        setApiCounts(data.bySource);
        setApiIsFallback(false);
      })
      .catch((err: Error) => {
        setApiError(err.message);
        setApiFilteredItems(API_SAMPLE_ITEMS);
        setApiYouthItems(API_SAMPLE_ITEMS);
        setApiAllItems(API_SAMPLE_ITEMS);
        setApiCounts(null);
        setApiIsFallback(true);
      })
      .finally(() => setApiLoading(false));
  };

  const openApiPreview = () => {
    setScreen("apiPreview");
    ensureApiDataLoaded();
  };

  // 자격 진단은 방문마다 라이브 공공데이터 API를 부르면 호출 한도에 걸릴 수 있어서, 별도로
  // 주기적으로 동기화해둔 DB(/api/announcements)에서 승인된 공고만 가져온다.
  const ensureEligDataLoaded = () => {
    if (eligItems !== null || eligLoading) return;
    setEligLoading(true);
    setEligError(null);
    fetch("/api/announcements")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? "공고 데이터를 불러오지 못했어요.");
        setEligItems(data.items as AnnouncementRecord[]);
      })
      .catch((err: Error) => {
        setEligError(err.message);
        setEligItems(
          API_SAMPLE_ITEMS.map((item) => ({
            ...item,
            regionScope: null,
            requiresEnrolled: false,
            interestCategories: [],
            descriptionTags: [],
          }))
        );
      })
      .finally(() => setEligLoading(false));
  };

  const openEligOnboarding = () => {
    ensureEligDataLoaded();
    if (savedProfile) {
      // 이미 계정에 저장된 답변이 있으면 온보딩 질문을 건너뛰고 바로 결과로 간다.
      setEligProfile(savedProfile);
      setScreen("eligResult");
    } else {
      setScreen("eligOnboarding");
    }
  };

  const handleEligSubmit = async () => {
    if (session && supabase) {
      await supabase.from("profiles").upsert(
        { id: session.user.id, onboarding_profile: eligProfile, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      setSavedProfile(eligProfile);
    }
    setScreen("eligResult");
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.pageBg }}>
      <SiteHeader onHome={restart} />
      <main
        style={{
          maxWidth: "640px",
          margin: "0 auto",
          padding: "28px 20px 80px",
        }}>
        <TopNav screen={screen} onHome={restart} />

        {screen === "landing" && savedProfile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => setScreen("eligOnboarding")}
                style={{ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: COLORS.inkMuted }}
              >
                🔁 진단 다시하기
              </button>
              <Link
                href="/community"
                style={{ fontSize: "13px", fontWeight: 700, color: COLORS.inkMuted, textDecoration: "none" }}
              >
                💬 커뮤니티
              </Link>
            </div>
            <EligibilityResultScreen
              profile={eligProfile}
              todayIso={todayIso}
              items={eligItems}
              loading={eligLoading}
              error={eligError}
              nickname={session ? getNickname(session) : null}
              onEditProfile={() => setScreen("eligOnboarding")}
              onBack={() => {}}
              hideFooterActions
              bookmarkedKeys={bookmarkedKeys}
              onToggleBookmark={session ? toggleBookmark : undefined}
            />
          </div>
        )}

        {screen === "landing" && !savedProfile && (
          <Landing
            onApiPreview={openApiPreview}
            onEligStart={openEligOnboarding}
          />
        )}

        {screen === "apiPreview" && process.env.NODE_ENV !== "production" && (
          <ApiPreviewScreen
            filteredItems={apiFilteredItems}
            youthItems={apiYouthItems}
            allItems={apiAllItems}
            viewMode={apiViewMode}
            onChangeViewMode={setApiViewMode}
            loading={apiLoading}
            error={apiError}
            isFallback={apiIsFallback}
            counts={apiCounts}
            selectedSource={apiSelectedSource}
            onSelectSource={(source) =>
              setApiSelectedSource((prev) => (prev === source ? null : source))
            }
            onBack={() => setScreen("landing")}
            bookmarkedKeys={bookmarkedKeys}
            onToggleBookmark={session ? toggleBookmark : undefined}
          />
        )}

        {screen === "eligOnboarding" && (
          <EligibilityOnboarding
            profile={eligProfile}
            todayIso={todayIso}
            onChange={setEligProfile}
            onSubmit={handleEligSubmit}
            onCancel={() => setScreen("landing")}
          />
        )}

        {screen === "eligResult" && (
          <EligibilityResultScreen
            profile={eligProfile}
            todayIso={todayIso}
            items={eligItems}
            loading={eligLoading}
            error={eligError}
            nickname={session ? getNickname(session) : null}
            onEditProfile={() => setScreen("eligOnboarding")}
            onBack={restart}
            bookmarkedKeys={bookmarkedKeys}
            onToggleBookmark={session ? toggleBookmark : undefined}
          />
        )}
      </main>
    </div>
  );
}

function SiteHeader({ onHome }: { onHome: () => void }) {
  return (
    <header
      style={{
        borderBottom: `1px solid ${COLORS.divider}`,
        position: "sticky",
        top: 0,
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 10,
      }}>
      <div
        style={{
          maxWidth: "640px",
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}>
        <button
          onClick={onHome}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "15px",
            fontWeight: 800,
            color: COLORS.onDark,
          }}>
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "8px",
              background: COLORS.brandCream,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}>
            <svg width="20" height="20" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="20" fill={COLORS.brandOrange} />
              <circle cx="27" cy="13" r="13" fill={COLORS.brandCream} />
              <circle cx="21" cy="17" r="8" fill={COLORS.brandPeach} />
            </svg>
          </span>
          <span style={{ color: COLORS.brandOrange }}>모자</span>{" "}
          <span style={{ color: COLORS.brandOrangeMuted, fontWeight: 600 }}>
            MOJA
          </span>
        </button>
        <AuthBar />
      </div>
    </header>
  );
}

function TopNav({ screen, onHome }: { screen: Screen; onHome: () => void }) {
  if (screen === "landing") return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
        marginBottom: "20px",
      }}>
      <button onClick={onHome} style={{ ...navLinkStyle }}>
        ← 처음으로
      </button>
    </div>
  );
}

function Landing({
  onApiPreview,
  onEligStart,
}: {
  onApiPreview: () => void;
  onEligStart: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        animation: "fadeIn 0.3s",
      }}>
      <header style={{ marginTop: "12px" }}>
        <span style={pillBadge("lime")}>MOJA · 자립지원 매칭</span>
        <h1
          style={{
            fontSize: "30px",
            fontWeight: 800,
            marginTop: "14px",
            color: COLORS.onDark,
            lineHeight: 1.3,
          }}>
          받을 수 있는 지원,
          <br />
          놓치지 않도록.
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: COLORS.onDarkMuted,
            marginTop: "12px",
            lineHeight: 1.6,
          }}>
          자립준비청년 여러분의 나이와 보호종료 후 지난 기간에 따라 지원이
          갈라져요.
          <br />
          모자가 조건에 맞는 것만 찾아 정리해드려요.
        </p>
      </header>

      <section style={CARD_STYLE}>
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            fontSize: "14px",
            color: "#3f3f46",
            listStyle: "none",
          }}>
          <li>✅ 12개 질문으로 21개 제도 전부 자격 판별</li>
          <li>✅ 못 받는 지원도 이유와 함께 확인</li>
          <li>✅ 중복수급 충돌 미리 경고</li>
        </ul>
      </section>

      <button
        onClick={onEligStart}
        style={{ ...PRIMARY_BUTTON, padding: "19px", fontSize: "16px" }}>
        내 자격 정밀 진단하기 →
      </button>

      <p
        style={{
          fontSize: "12px",
          color: COLORS.onDarkFaint,
          textAlign: "center",
          lineHeight: 1.6,
        }}>
        이 판정은 MVP 근사치예요. 최종 자격과 기한은 반드시 담당
        자립지원전담기관에서
        <br />
        다시 확인해주세요.
      </p>

      <Link
        href="/community"
        style={{
          ...GHOST_BUTTON_ON_DARK,
          display: "block",
          textAlign: "center",
          textDecoration: "none",
        }}>
        💬 커뮤니티
      </Link>

      {process.env.NODE_ENV !== "production" && (
        <button
          onClick={onApiPreview}
          style={{
            background: "none",
            border: "none",
            fontSize: "13px",
            fontWeight: 700,
            color: COLORS.onDarkMuted,
            textDecoration: "underline",
          }}>
          🔎 실시간 공공데이터 API 결과 보기 (관리자용)
        </button>
      )}
    </div>
  );
}

function ApiPreviewScreen({
  filteredItems,
  youthItems,
  allItems,
  viewMode,
  onChangeViewMode,
  loading,
  error,
  isFallback,
  counts,
  selectedSource,
  onSelectSource,
  onBack,
  bookmarkedKeys,
  onToggleBookmark,
}: {
  filteredItems: WelfareItem[] | null;
  youthItems: WelfareItem[] | null;
  allItems: WelfareItem[] | null;
  viewMode: "careLeaver" | "youth" | "all";
  onChangeViewMode: (mode: "careLeaver" | "youth" | "all") => void;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
  counts: Record<
    WelfareSource,
    {
      totalCount: number;
      fetchedCount: number;
      filteredCount: number;
      youthCount: number;
    }
  > | null;
  selectedSource: WelfareSource | null;
  onSelectSource: (source: WelfareSource) => void;
  onBack: () => void;
  bookmarkedKeys: Set<string>;
  onToggleBookmark?: (source: string, sourceId: string) => void;
}) {
  const baseItems =
    viewMode === "all"
      ? allItems
      : viewMode === "youth"
        ? youthItems
        : filteredItems;
  const items = selectedSource
    ? baseItems?.filter((item) => item.source === selectedSource)
    : baseItems;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        animation: "fadeIn 0.3s",
      }}>
      <h2 style={{ fontSize: "20px", fontWeight: 800, color: COLORS.onDark }}>
        실시간 공공데이터 API 결과
      </h2>
      <p
        style={{
          fontSize: "13px",
          color: COLORS.onDarkMuted,
          lineHeight: 1.6,
        }}>
        복지서비스·정부24·마이홈포털·고용24 등 7개 공공 API에서
        &quot;자립&quot;·&quot;청년&quot; 두 키워드로 조회했어요. 아래 버튼으로
        자립준비청년 관련·청년 관련·원본 전체 중 골라 볼 수 있고, 소스 카드를
        누르면 그 소스만 따로 볼 수 있어요.
      </p>

      {!loading && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => onChangeViewMode("careLeaver")}
            disabled={viewMode === "careLeaver"}
            style={
              viewMode === "careLeaver"
                ? toggleActiveStyle
                : toggleInactiveStyle
            }>
            자립준비청년 관련만 ({filteredItems?.length ?? 0})
          </button>
          <button
            onClick={() => onChangeViewMode("youth")}
            disabled={viewMode === "youth"}
            style={
              viewMode === "youth" ? toggleActiveStyle : toggleInactiveStyle
            }>
            청년 관련만 ({youthItems?.length ?? 0})
          </button>
          <button
            onClick={() => onChangeViewMode("all")}
            disabled={viewMode === "all"}
            style={
              viewMode === "all" ? toggleActiveStyle : toggleInactiveStyle
            }>
            전체 공고 ({allItems?.length ?? 0})
          </button>
        </div>
      )}

      {counts && !isFallback && (
        <section style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {(Object.keys(SOURCE_LABEL) as WelfareSource[]).map((source) => {
            const active = selectedSource === source;
            return (
              <button
                key={source}
                onClick={() => onSelectSource(source)}
                style={{
                  ...CARD_STYLE,
                  flex: "1 1 160px",
                  padding: "14px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: active
                    ? `1.5px solid ${COLORS.ink}`
                    : CARD_STYLE.border,
                }}>
                <p
                  style={{
                    fontSize: "11px",
                    color: COLORS.inkMuted,
                    fontWeight: 700,
                  }}>
                  {SOURCE_LABEL[source]}
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#3f3f46",
                    marginTop: "4px",
                  }}>
                  전체 {counts[source].totalCount}건 중{" "}
                  {counts[source].fetchedCount}건 조회
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: COLORS.accentViolet,
                    fontWeight: 700,
                    marginTop: "2px",
                  }}>
                  → 자립준비청년 관련 {counts[source].filteredCount}건
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#0369a1",
                    fontWeight: 700,
                    marginTop: "2px",
                  }}>
                  → 청년 관련 {counts[source].youthCount}건
                </p>
                {active && (
                  <p
                    style={{
                      fontSize: "11px",
                      color: COLORS.ink,
                      fontWeight: 700,
                      marginTop: "6px",
                    }}>
                    이 소스만 보는 중 · 다시 누르면 해제
                  </p>
                )}
              </button>
            );
          })}
        </section>
      )}

      {isFallback && error && (
        <section
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "14px",
            padding: "14px 16px",
          }}>
          <p style={{ fontSize: "13px", color: "#991b1b" }}>
            실시간 호출에 실패해서 예시 데이터로 보여드려요. ({error})
          </p>
        </section>
      )}

      {loading && (
        <section style={CARD_STYLE}>
          <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>
            불러오는 중이에요...
          </p>
        </section>
      )}

      {!loading && items && items.length === 0 && (
        <section style={CARD_STYLE}>
          <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>
            조건에 맞는 공고가 없어요.
          </p>
        </section>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {items?.map((item, index) => (
          <ApiResultCard
            key={`${item.source}-${item.servId}-${index}`}
            item={item}
            bookmarked={onToggleBookmark ? bookmarkedKeys.has(bookmarkKey(item.source, item.servId)) : undefined}
            onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(item.source, item.servId) : undefined}
          />
        ))}
      </div>

      <button onClick={onBack} style={GHOST_BUTTON_ON_DARK}>
        ← 돌아가기
      </button>
    </div>
  );
}

const SOURCE_BADGE_COLOR: Record<
  WelfareSource,
  { background: string; color: string }
> = {
  central: { background: "#eef2ff", color: "#3730a3" },
  local: { background: "#ecfeff", color: "#155e75" },
  gov24: { background: "#f0fdf4", color: "#166534" },
  housing: { background: "#fef9c3", color: "#854d0e" },
  training: { background: "#fce7f3", color: "#9d174d" },
  jobseekerProgram: { background: "#e0e7ff", color: "#4338ca" },
  dualTraining: { background: "#dcfce7", color: "#15803d" },
  youthCenter: { background: "#fdf2f8", color: "#a21caf" },
};

function ApiResultCard({
  item,
  bookmarked,
  onToggleBookmark,
}: {
  item: WelfareItem;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  return (
    <section style={CARD_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ ...badgeStyle, ...SOURCE_BADGE_COLOR[item.source] }}>
          {SOURCE_LABEL[item.source]}
        </span>
        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            aria-label="관심공고 등록"
            style={{ background: "none", border: "none", fontSize: "20px", lineHeight: 1, color: COLORS.ink, padding: 0 }}
          >
            {bookmarked ? "⭐" : "☆"}
          </button>
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink }}>
          {item.servNm}
        </p>
        <p
          style={{
            fontSize: "12px",
            color: COLORS.inkMuted,
            marginTop: "2px",
          }}>
          {item.org}
          {item.region && ` · ${item.region}`}
        </p>
      </div>

      <p
        style={{
          fontSize: "13px",
          color: "#3f3f46",
          marginTop: "10px",
          lineHeight: 1.6,
        }}>
        {item.servDgst}
      </p>

      <div
        style={{
          marginTop: "12px",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
        }}>
        {item.themes.map((tag) => (
          <span key={tag} style={badgeStyle}>
            #{tag}
          </span>
        ))}
        {item.lifeStages.map((stage) => (
          <span
            key={stage}
            style={{ ...badgeStyle, background: "#f0fdf4", color: "#166534" }}>
            {stage}
          </span>
        ))}
        {item.targetTraits && (
          <span
            style={{ ...badgeStyle, background: "#fef3c7", color: "#92400e" }}>
            {item.targetTraits}
          </span>
        )}
        {item.onlineApplicable && (
          <span
            style={{ ...badgeStyle, background: "#eff6ff", color: "#1d4ed8" }}>
            🖥 온라인 신청 가능
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: "12px",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "12px",
          color: COLORS.inkMuted,
        }}>
        {item.sprtCycNm && <span>🗓 지원주기 {item.sprtCycNm}</span>}
        {item.srvPvsnNm && <span>💵 {item.srvPvsnNm}</span>}
        {item.deadline && <span>⏰ 신청기한 {item.deadline}</span>}
        {item.applyMethod && <span>📍 신청방법 {item.applyMethod}</span>}
        {item.contact && <span>☎ {item.contact}</span>}
      </div>

      <a
        href={item.link}
        target="_blank"
        rel="noreferrer"
        onClick={() => logAnnouncementClick(item.source, item.servId)}
        style={{
          display: "inline-block",
          marginTop: "14px",
          fontSize: "13px",
          fontWeight: 700,
          color: COLORS.accentViolet,
          textDecoration: "none",
        }}>
        상세 페이지 바로가기 →
      </a>
    </section>
  );
}

const badgeStyle = {
  fontSize: "11px",
  fontWeight: 700,
  padding: "4px 10px",
  borderRadius: "999px",
  background: "#f4f4f5",
  color: "#3f3f46",
} as const;

const navLinkStyle = {
  background: "none",
  border: "none",
  fontSize: "14px",
  fontWeight: 700,
  color: COLORS.onDarkMuted,
} as const;

const toggleActiveStyle = {
  ...GHOST_BUTTON_ON_CARD,
  flex: 1,
  padding: "12px",
  fontSize: "13px",
  background: COLORS.ink,
  color: "#ffffff",
  border: `1.5px solid ${COLORS.ink}`,
} as const;

const toggleInactiveStyle = {
  ...GHOST_BUTTON_ON_CARD,
  flex: 1,
  padding: "12px",
  fontSize: "13px",
  fontWeight: 700,
} as const;
