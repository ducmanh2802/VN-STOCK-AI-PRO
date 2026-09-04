import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  const result = await db
    .insert(users)
    .values({
      uid,
      email,
      displayName: displayName || null,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        displayName: displayName || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}
