import bcrypt from 'bcryptjs';
import { selectQuery } from '../db/client';

export async function verifyCredentials(username: string, pin: string) {
  // Always sanitize inputs
  const cleanUsername = username.trim();

  // Query User record securely using parameterized statement
  const rows = await selectQuery<{ id: string; username: string; password_hash: string; full_name: string; role: string; status: string }>(
    'SELECT * FROM users WHERE username = ? AND status = "ACTIVE"',
    [cleanUsername]
  );

  if (!rows || rows.length === 0) {
    return { success: false, error: 'Invalid credentials or inactive account.' };
  }

  const user = rows[0];
  const isMatch = await bcrypt.compare(pin, user.password_hash);

  if (!isMatch) {
    return { success: false, error: 'Invalid PIN provided.' };
  }

  const sessionToken = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  return {
    success: true,
    data: {
      token: sessionToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    },
  };
}