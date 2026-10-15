import type { Request, Response, NextFunction } from 'express';
import { adminAuth, AdminAuthUnavailableError } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    if (error instanceof AdminAuthUnavailableError) {
      res.status(401).json({ status: 'AUTH_CONFIGURATION_REQUIRED' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
