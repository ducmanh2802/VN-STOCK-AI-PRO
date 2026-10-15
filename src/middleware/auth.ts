import { Request, Response, NextFunction } from 'express';
import { adminAuth, AdminAuthUnavailableError } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    // Auth is unconfigured (no project id / no ADC). Deny explicitly instead of
    // reporting a misleading "Invalid token", and never let access through.
    if (error instanceof AdminAuthUnavailableError) {
      console.error('Firebase admin auth is unconfigured:', error.reason);
      return res.status(401).json({
        error: 'Unauthorized: Authentication is not configured on this deployment',
        status: 'AUTH_CONFIGURATION_REQUIRED',
      });
    }
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
