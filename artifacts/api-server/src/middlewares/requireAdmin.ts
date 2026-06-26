import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const raw = process.env.API_SECRET_KEY;
if (!raw) {
  throw new Error("API_SECRET_KEY environment variable is required but was not provided.");
}
const JWT_SECRET: string = raw;

export interface AdminPayload {
  walletAddress: string;
  label: string | null;
  role: string;
}

export interface AdminRequest extends Request {
  admin?: AdminPayload;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as AdminPayload;
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
