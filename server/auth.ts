import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { authSessions, members } from "@shared/schema";
import { config } from "./config";

const scrypt = promisify(scryptCallback);
const roleRank = { viewer: 0, editor: 1, owner: 2 } as const;
type Role = keyof typeof roleRank;
type AuthMember = { id: string; workspaceId: string; email: string; displayName: string; role: string };

declare global {
  namespace Express {
    interface Request { authMember?: AuthMember; }
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const authClient = config.DATABASE_URL ? postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20 }) : null;
const authDatabase = authClient ? drizzle(authClient) : null;
const authDb = () => {
  if (!authDatabase) throw new Error("Database authentication requires DATABASE_URL");
  return authDatabase;
};

export async function login(email: string, password: string) {
  const db = authDb();
  const member = (await db.select().from(members).where(eq(members.email, email.toLowerCase())).limit(1))[0];
  if (!member?.passwordHash || !(await verifyPassword(password, member.passwordHash))) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await db.insert(authSessions).values({ memberId: member.id, tokenHash: tokenHash(token), expiresAt });
  return {
    token,
    expiresAt,
    member: { id: member.id, workspaceId: member.workspaceId, email: member.email, displayName: member.displayName, role: member.role },
  };
}

export async function revokeToken(token: string) {
  const db = authDb();
  await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.tokenHash, tokenHash(token)));
}

async function resolveToken(token: string): Promise<AuthMember | undefined> {
  const db = authDb();
  const row = (await db.select({
    id: members.id, workspaceId: members.workspaceId, email: members.email,
    displayName: members.displayName, role: members.role,
  }).from(authSessions)
    .innerJoin(members, eq(authSessions.memberId, members.id))
    .where(and(eq(authSessions.tokenHash, tokenHash(token)), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
    .limit(1))[0];
  return row;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  if (!config.AUTH_REQUIRED && config.APP_ENV !== "production") return next();
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
  const member = await resolveToken(header.slice(7));
  if (!member) return res.status(401).json({ message: "Invalid or expired session" });
  req.authMember = member;
  return next();
}

export function requireRole(minimum: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!config.AUTH_REQUIRED && config.APP_ENV !== "production") return next();
    await authenticate(req, res, () => {
      const role = req.authMember?.role as Role | undefined;
      if (!role || roleRank[role] < roleRank[minimum]) return res.status(403).json({ message: "Insufficient role" });
      return next();
    });
  };
}

export async function currentMember(req: Request) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return resolveToken(header.slice(7));
}
