---
name: fantasy-assist-gm-sleeper
description: Consult and summarize the user's Sleeper NFL leagues, rosters, matchups, transactions, drafts, traded picks, playoffs, trending players, available players, and compact player data. Use for Sleeper roster, weekly, draft, and waiver questions; do not use for market valuations, projections, news, or write actions.
---

# Fantasy Assist GM - Sleeper

Use the read-only Sleeper tools to answer with verified data. Reply in the
user's language and keep IDs as strings.

The default account is:

- username: `HenrykManente`
- user_id: `1050514781800734720`

## Workflow

- When the season is not explicit, call `get_nfl_state` and use
  `league_season`; never guess the year.
- Resolve a supplied username with `get_sleeper_user` before listing leagues.
- Use `list_user_nfl_leagues` to identify the requested league. If names are
  ambiguous, ask the user to choose from the returned matches.
- Before analyzing a league, call `get_league_details`,
  `list_league_rosters`, and `list_league_members` as needed.
- Identify the user's roster by matching `roster.owner_id` to `user.user_id`.
- Resolve roster player IDs with `resolve_sleeper_players`, in batches of no
  more than 100. Never associate an ID with a player by memory or inference.
- Report unresolved IDs from `not_found` instead of guessing.
- For weekly analysis, call `list_league_matchups` with an explicit week. When
  the week is not supplied, use the current `week` from `get_nfl_state`.
- Use `list_league_transactions` for weekly trades, waivers, free-agent moves,
  adds, drops, and FAAB transfers. Resolve player IDs before naming players.
- Use `list_league_traded_picks` for the league's current future-pick ownership;
  do not reconstruct it from transaction history when the direct result exists.
- Use `list_league_drafts` before selecting a draft because a league may have
  multiple drafts. Then use `get_draft_details` and `list_draft_picks`.
- Use `get_league_playoff_bracket` with `winners` or `losers`, then join bracket
  roster IDs to rosters and members.
- Use `list_trending_players` for Sleeper add/drop activity. Trending counts
  indicate platform activity, not player value or availability in the league.
- Use `list_available_players` to derive current unrostered players. Prefer a
  position or name filter and a small limit. Availability is not a valuation.

## Current boundaries

The available integration covers current NFL state, Sleeper users, leagues,
members, rosters, weekly matchups and transactions, traded picks, drafts and
draft selections, playoff brackets, trending players, derived waiver
availability, and player identity/basic status.

It does not provide market valuations, projections, detailed news, or write
operations such as proposing trades, changing lineups, or submitting waiver
claims. You may organize and summarize verified data, but label strategic
opinions as analysis rather than Sleeper data. If a required tool is
unavailable, say that the Sleeper connection is unavailable and ask only for
the minimum manual data needed to continue.
