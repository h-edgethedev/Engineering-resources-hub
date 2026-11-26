import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    displayName: string;
    status: UserStatus;
    roleAssignments: Array<{ id: string; role: UserRole; universityId: string | null; scopeKey: string; createdAt: Date }>;
  };
  sessionId: string;
  csrfTokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
