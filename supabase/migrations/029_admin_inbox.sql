-- Admin email inbox rebuild (docs/ADMIN_EMAIL_INBOX.md).
--
-- 1. thread_id is a thread KEY, not a foreign key. It holds the id of the
--    thread's first email. The FK from 010 meant any insert that opened a new
--    thread with a generated UUID failed outright; the code now writes
--    thread_id = id for a thread's first message, which satisfies either shape.
alter table public.emails drop constraint if exists emails_thread_id_fkey;

-- 2. Every email belongs to a thread. The existing rows (internal lead alerts)
--    become their own threads, so a reply to one is grouped with it.
update public.emails set thread_id = id where thread_id is null;

-- 3. Spam is kept in a Spam folder instead of being dropped at the webhook,
--    so a false positive can be rescued ("Not spam").
alter table public.emails add column if not exists is_spam boolean not null default false;

-- 4. Folder and threading lookups.
create index if not exists idx_emails_inbox_unread
  on public.emails(created_at desc)
  where direction = 'inbound' and status = 'received' and is_spam = false;
create index if not exists idx_emails_spam
  on public.emails(created_at desc)
  where is_spam = true;
create index if not exists idx_emails_starred
  on public.emails(created_at desc)
  where is_starred = true;
-- In-Reply-To matching: a reply's In-Reply-To is the Message-ID we stored.
create index if not exists idx_emails_message_id
  on public.emails((headers->>'message-id'))
  where headers ? 'message-id';
