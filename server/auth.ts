import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { db, getUser, uid, now } from "./db.js";
import { config, assert, HttpError } from "./config.js";
import type { User } from "../shared/types.js";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export function createSession(userId: string, res: Response) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(
    createHash("sha256").update(token).digest("hex"),
    userId,
    Date.now() + 7 * 86400000,
  );
  res.cookie("zk_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookie,
    maxAge: 7 * 86400000,
    path: "/",
  });
}
export function destroySession(req: Request, res: Response) {
  const token = req.cookies?.zk_session;
  if (token)
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      createHash("sha256").update(token).digest("hex"),
    );
  res.clearCookie("zk_session", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookie,
  });
}
export function sessionUser(req: Request): User | undefined {
  const token = req.cookies?.zk_session;
  if (!token) return undefined;
  const row = db
    .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
    .get(createHash("sha256").update(token).digest("hex"), Date.now()) as any;
  return row ? getUser(row.user_id) : undefined;
}
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    let user = sessionUser(req);
    const auth = req.headers.authorization;
    if (!user && auth?.startsWith("Bearer zk_")) {
      const key = createHash("sha256").update(auth.slice(7)).digest("hex");
      const row = db
        .prepare("SELECT user_id FROM api_keys WHERE hash=?")
        .get(key) as any;
      if (row) {
        user = getUser(row.user_id);
        res.locals.apiAuth = true;
      }
    }
    assert(user, "Please sign in to continue.", 401);
    assert(!user.suspended, "This account is suspended. Contact support.", 403);
    res.locals.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
export function admin(req: Request, res: Response, next: NextFunction) {
  if (res.locals.apiAuth)
    return next(
      new HttpError(
        403,
        "Administrator endpoints require an interactive session, not an API key.",
      ),
    );
  if (res.locals.user?.role !== "admin")
    return next(new HttpError(403, "Administrator access is required."));
  next();
}
export function csrf(req: Request, res: Response, next: NextFunction) {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
    req.headers.authorization?.startsWith("Bearer ")
  )
    return next();
  const origin = req.headers.origin;
  const expected = [config.publicUrl, `${req.protocol}://${req.get("host")}`];
  if (
    req.headers["x-zk-request"] !== "1" ||
    (origin &&
      !expected.includes(origin) &&
      new URL(origin).host !== req.get("host"))
  )
    return next(
      new HttpError(
        403,
        "Request origin could not be verified. Refresh the panel and try again.",
      ),
    );
  next();
}
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: "admin" | "user" = "user",
  username?: string,
) {
  const id = uid("usr_");
  db.prepare(
    "INSERT INTO users(id,name,email,password,role,created_at,username) VALUES(?,?,?,?,?,?,?)",
  ).run(
    id,
    name,
    email.toLowerCase(),
    await hashPassword(password),
    role,
    now(),
    username?.toLowerCase() || null,
  );
  return getUser(id)!;
}
