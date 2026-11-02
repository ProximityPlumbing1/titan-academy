export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/titan_test',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  isProd: process.env.NODE_ENV === 'production',
  // One-time code that lets the owner set the first admin password at /setup.
  // /setup switches itself off as soon as any admin has a password.
  setupCode: process.env.ADMIN_SETUP_CODE || '',
  ownerEmail: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
  sessionDays: 90,
  inviteDays: 7,
  resetDays: 2,
};
