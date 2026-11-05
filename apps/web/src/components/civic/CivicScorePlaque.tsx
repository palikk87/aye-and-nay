import { Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MotionDiv } from "@/components/civic/Motion";
import { useCivicScore } from "@/hooks/use-civic-score";
import { CIVIC_LEVELS } from "@/lib/mobile/gamification";

/**
 * THE PLAQUE. A brass-rimmed panel that fades green into gold, with the score
 * set large in the display face and the streak on a lit pill.
 *
 * IT LIVES ON THE PROFILE. It used to open the Public Square, above the feed,
 * where it was the first thing on the busiest page in the app. It is a record
 * of what YOU have done, so it belongs with the rest of your record.
 *
 * THE NUMBER COMES FROM THE SERVER. It read a zustand store persisted to
 * localStorage, so each browser kept its own tally — reported as a streak
 * "showing 1 thing on my computer but something else on my phone". Both were
 * telling the truth about themselves. It is counted from real votes, posts and
 * comments now, so every device gives the same answer and clearing a cache
 * changes nothing.
 */
export function CivicScorePlaque({ className = "mx-4 mb-3" }: { className?: string }) {
  const { data } = useCivicScore();
  const score = data?.score;
  const navigate = useNavigate();

  // Zero until the server answers, rather than a remembered number from this
  // browser that might not be true any more.
  const civicScore = { total: score?.total ?? 0, xpToNextLevel: score?.toNextLevel ?? 0 };
  // Optional at every step, not just the first: a response missing a field must
  // degrade to a zero rather than take the page down.
  const streak = { current: score?.streak?.current ?? 0 };
  const levelInfo = { title: score?.levelTitle ?? CIVIC_LEVELS.newcomer.title };
  const progressPct = score ? (score.intoLevel / score.levelSpan) * 100 : 0;

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      <button
        // OPENS THE SCORE, NOT THE PROFILE. Reported as "when you click on it
        // it just takes you to your profile rather opening up the feature
        // further and expanding more into what it is".
        onClick={() => navigate("/civic-score")}
        className="relative w-full overflow-hidden rounded-2xl border border-accent/40 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_26px_-8px_rgba(245,158,11,0.5)]"
        style={{
          backgroundImage:
            "linear-gradient(118deg,#20573C 0%,#173F2C 34%,#4E3A12 68%,#7A5A15 100%)",
        }}
      >
        {/* a slow sweep across the brass, the way light moves over metal */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-shimmer-sweep"
          style={{
            backgroundImage:
              "linear-gradient(105deg,transparent 30%,rgba(255,194,77,0.3) 48%,transparent 66%)",
            backgroundSize: "260% 100%",
          }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="plaque-label text-amber-200">Civic score</p>
            <p className="font-display text-3xl font-extrabold leading-none text-white tabular-nums drop-shadow-[0_0_18px_rgba(255,216,107,0.6)]">
              {civicScore.total}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-amber-300/25">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 shadow-[0_0_12px_rgba(255,216,107,0.8)]"
                style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-amber-100/70">
              {levelInfo.title} · {civicScore.xpToNextLevel} to next
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {streak.current > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-2.5 py-1 font-mono text-xs font-bold text-emerald-950 shadow-[0_0_16px_-2px_rgba(255,216,107,0.8)]">
                <Flame size={12} />
                {streak.current}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </MotionDiv>
  );
}
