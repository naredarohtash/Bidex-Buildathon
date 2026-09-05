"use client";

/**
 * Open the ranking rules from whichever ⓘ was pressed.
 *
 * The title over the ranking column is drawn by the desktop layout — it is the
 * band the docked column continues through — while the rules themselves belong
 * to the leaderboard inside it. The one control that connects them is an ⓘ
 * beside the word "Ranking", so it says what it opens.
 *
 * The event carries the button's own rectangle, because the card opens *at* the
 * button rather than in the middle of the screen: a small panel hanging off the
 * mark you pressed is read as an answer to it, where a centred dialog is read as
 * an interruption — and these are five lines of housekeeping, not a decision.
 */

export const RANKING_RULES_EVENT = "vortex-ranking-rules";

export interface RankingRulesAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function openRankingRules(from?: HTMLElement | null) {
  if (typeof window === "undefined") return;
  const rect = from?.getBoundingClientRect();
  const detail: RankingRulesAnchor | null = rect
    ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    : null;
  window.dispatchEvent(new CustomEvent(RANKING_RULES_EVENT, { detail }));
}

/** Hidden again — the pointer left the mark. */
export function closeRankingRules() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RANKING_RULES_EVENT, { detail: null }));
}

/**
 * The handlers every ⓘ gets, wherever it is drawn.
 *
 * Hover opens it and leaving closes it, because five lines of housekeeping are
 * something you glance at rather than something you open and put away. Focus
 * and click do the same, so a keyboard and a touchscreen — neither of which
 * hovers — reach it too.
 */
export function rankingRulesTriggerProps() {
  return {
    onMouseEnter: (e: { currentTarget: HTMLElement }) => openRankingRules(e.currentTarget),
    onMouseLeave: () => closeRankingRules(),
    onFocus: (e: { currentTarget: HTMLElement }) => openRankingRules(e.currentTarget),
    onBlur: () => closeRankingRules(),
    onClick: (e: { currentTarget: HTMLElement }) => openRankingRules(e.currentTarget),
  };
}
