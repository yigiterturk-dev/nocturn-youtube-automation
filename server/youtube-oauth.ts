import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { channels, integrations, oauthStates } from "@shared/schema";
import { config } from "./config";
import { encryptSecret } from "./secrets";

const scopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
] as const;

const client = config.DATABASE_URL ? postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20 }) : null;
const db = client ? drizzle(client) : null;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function oauthConfig() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured");
  }
  return { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, redirectUri: config.GOOGLE_REDIRECT_URI };
}

export function youtubeOAuthStatus() {
  return {
    configured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI && config.SESSION_SECRET && config.DATABASE_URL),
    redirectUri: config.GOOGLE_REDIRECT_URI || null,
    scopes,
  };
}

export async function createYouTubeAuthorization(memberId: string, workspaceId: string) {
  if (!db) throw new Error("Database is required for OAuth");
  const state = randomBytes(32).toString("base64url");
  await db.insert(oauthStates).values({
    memberId, workspaceId, provider: "youtube", stateHash: hash(state),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  const oauth = oauthConfig();
  const params = new URLSearchParams({
    client_id: oauth.clientId, redirect_uri: oauth.redirectUri,
    response_type: "code", access_type: "offline",
    include_granted_scopes: "true", prompt: "consent",
    scope: scopes.join(" "), state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function completeYouTubeAuthorization(code: string, state: string) {
  if (!db) throw new Error("Database is required for OAuth");
  const pending = (await db.select().from(oauthStates).where(and(
    eq(oauthStates.stateHash, hash(state)),
    eq(oauthStates.provider, "youtube"),
    isNull(oauthStates.consumedAt),
    gt(oauthStates.expiresAt, new Date()),
  )).limit(1))[0];
  if (!pending) throw new Error("Invalid or expired OAuth state");
  await db.update(oauthStates).set({ consumedAt: new Date() }).where(eq(oauthStates.id, pending.id));

  const oauth = oauthConfig();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: oauth.clientId, client_secret: oauth.clientSecret,
      redirect_uri: oauth.redirectUri, grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string; error_description?: string };
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || "Google token exchange failed");
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token; revoke consent and reconnect");

  const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const channelPayload = await channelResponse.json() as { items?: Array<{ id?: string; snippet?: { title?: string } }>; error?: { message?: string } };
  if (!channelResponse.ok) throw new Error(channelPayload.error?.message || "YouTube channel lookup failed");
  const channel = channelPayload.items?.[0];
  if (!channel?.id) throw new Error("No YouTube channel is available for this Google account");

  const encryptedCredentials = encryptSecret({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: Date.now() + (tokens.expires_in || 3600) * 1000,
    tokenType: tokens.token_type,
  });
  await db.insert(integrations).values({
    workspaceId: pending.workspaceId,
    provider: "youtube",
    status: "connected",
    encryptedCredentials,
    scopes: tokens.scope?.split(" ") || [...scopes],
    metadata: { channelId: channel.id, channelTitle: channel.snippet?.title || "YouTube channel" },
    lastSyncedAt: new Date(),
  }).onConflictDoUpdate({
    target: [integrations.workspaceId, integrations.provider],
    set: {
      status: "connected", encryptedCredentials,
      scopes: tokens.scope?.split(" ") || [...scopes],
      metadata: { channelId: channel.id, channelTitle: channel.snippet?.title || "YouTube channel" },
      lastSyncedAt: new Date(), updatedAt: new Date(),
    },
  });

  const existingChannel = (await db.select().from(channels).where(eq(channels.youtubeChannelId, channel.id)).limit(1))[0];
  if (existingChannel) {
    await db.update(channels).set({ name: channel.snippet?.title || existingChannel.name, status: "connected", updatedAt: new Date() }).where(eq(channels.id, existingChannel.id));
  } else {
    await db.insert(channels).values({
      workspaceId: pending.workspaceId, youtubeChannelId: channel.id,
      name: channel.snippet?.title || "YouTube channel", status: "connected",
    });
  }
  return { workspaceId: pending.workspaceId, channelId: channel.id, channelTitle: channel.snippet?.title };
}
