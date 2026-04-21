-- Critical #1: brute-force lockout wiring. User.isLockedOut existed but was
-- never written; this adds the companion expiry so the lockout can auto-clear
-- after the window passes (default 15 minutes). See src/lib/login-lockout.ts.

ALTER TABLE "User" ADD COLUMN "lockoutUntil" TIMESTAMP(3);
