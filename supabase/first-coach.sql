-- Create your first coach invite code. Replace the code with something private
-- (letters, numbers, and dashes only), run it once, then sign in to the app and
-- redeem it. Students get their codes from the Coach view after that.
insert into public.cmt_invite_codes (code, role, max_uses, expires_at, note)
values ('COACH-REPLACE-WITH-PRIVATE-CODE', 'coach', 1, now() + interval '7 days', 'First coach login');
