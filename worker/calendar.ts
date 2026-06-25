// Google Calendar integration (SCAFFOLD).
//
// Design: the app READS the user's whole Google calendar (as context for the
// Brain) but only PUSHES the important app events back, so the real calendar
// stays uncluttered. There is no in-app calendar viewer/editor to build.
//
// Auth: single-user, so the simplest path is a one-time OAuth consent done by
// the user, with the refresh token stored as a Worker secret. The Worker
// exchanges it for short-lived access tokens. Tokens never reach the client.
//
// Secrets to add (wrangler): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN.

import type { Env } from "./index";
import type { EventItem } from "../shared/types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Exchange the stored refresh token for a short-lived access token. */
export async function getAccessToken(env: Env): Promise<string> {
  // TODO: cache the token until ~expiry to avoid an exchange per request.
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: env.GOOGLE_REFRESH_TOKEN ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Read upcoming events from Google to feed the Brain's context. */
export async function listGoogleEvents(env: Env, _opts?: { from?: number; to?: number }): Promise<EventItem[]> {
  // TODO: page through events.list, map to EventItem (source:'google'),
  // expand recurrence as needed, upsert into the events table.
  void env;
  return [];
}

/** Push one important app event to Google; record google_event_id + pushed=1. */
export async function pushEventToGoogle(env: Env, _event: EventItem): Promise<string> {
  // TODO: events.insert (or update if google_event_id already set). Return id.
  void CAL;
  void env;
  throw new Error("not implemented");
}

// TODO: webhook/poll strategy for keeping the mirror fresh. Polling on board
// load is the simplest first cut and matches the daily cadence.
