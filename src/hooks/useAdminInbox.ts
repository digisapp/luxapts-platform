"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import type { BulkAction, EmailDetail, EmailListItem, FolderCounts, InboxFolder, InboxStatus } from "@/components/admin/inbox/types";
import { quoteText, replySubject } from "@/components/admin/inbox/types";

export interface ComposeState {
  open: boolean;
  to: string;
  subject: string;
  bodyText: string;
  replyToEmailId?: string;
  quotedText?: string;
}

const EMPTY_COMPOSE: ComposeState = { open: false, to: "", subject: "", bodyText: "" };
const SEARCH_DEBOUNCE_MS = 300;
const POLL_MS = 45_000;
const PAGE_SIZE = 25;
const JSON_HEADERS = { "Content-Type": "application/json" };

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return (data && typeof data.error === "string" && data.error) || fallback;
}

export function useAdminInbox() {
  const { success: showSuccess, error: showError } = useToast();

  // ── List ──
  const [folder, setFolderState] = useState<InboxFolder>("inbox");
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<FolderCounts>({ unread: 0, starred: 0, spam: 0 });

  // ── Detail ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [thread, setThread] = useState<EmailDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Compose ──
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [sending, setSending] = useState(false);

  // ── Selection / bulk ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  // ── Auto-reply ──
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyLoading, setAutoReplyLoading] = useState(true);

  // ── Receiving status ──
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  // Search debounce → page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Guards against out-of-order responses when folder/search/page change
  // while a previous fetch is still in flight.
  const fetchSeq = useRef(0);

  const fetchEmails = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const seq = ++fetchSeq.current;
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({ folder, page: String(page), limit: String(PAGE_SIZE) });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/admin/inbox?${params}`);
        if (!res.ok) throw new Error(await readError(res, "Failed to load emails"));
        const data = await res.json();
        if (seq !== fetchSeq.current) return;
        setEmails(data.emails ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
        if (data.counts) setCounts(data.counts);
      } catch (err) {
        if (seq === fetchSeq.current && !opts.silent) setError(err instanceof Error ? err.message : "Failed to load emails");
      } finally {
        if (seq === fetchSeq.current && !opts.silent) setLoading(false);
      }
    },
    [folder, page, debouncedSearch]
  );

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // New mail shows up without a manual refresh: poll while the tab is
  // visible and nothing is selected for a bulk action.
  const fetchEmailsRef = useRef(fetchEmails);
  fetchEmailsRef.current = fetchEmails;
  const selectionSize = selectedIds.size;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || selectionSize > 0) return;
      fetchEmailsRef.current({ silent: true });
    };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [selectionSize]);

  const fetchStatus = useCallback(async (fresh = false) => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/inbox/status${fresh ? "?fresh=1" : ""}`);
      if (res.ok) setStatus(await res.json());
    } catch {
      /* the page still works without the status card */
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/inbox/settings?key=ai_auto_reply_enabled");
        if (res.ok) {
          const data = await res.json();
          setAutoReplyEnabled(data.value === true);
        }
      } catch {
        /* defaults to off */
      } finally {
        setAutoReplyLoading(false);
      }
    })();
  }, []);

  const setAutoReply = useCallback(
    async (value: boolean) => {
      setAutoReplyLoading(true);
      try {
        const res = await fetch("/api/admin/inbox/settings", {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ key: "ai_auto_reply_enabled", value }),
        });
        if (!res.ok) throw new Error(await readError(res, "Could not save"));
        setAutoReplyEnabled(value);
        showSuccess(value ? "AI auto-reply is on" : "AI auto-reply is off");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not save");
      } finally {
        setAutoReplyLoading(false);
      }
    },
    [showSuccess, showError]
  );

  // ── Detail ──
  const patchFlags = useCallback(async (id: string, flags: Record<string, boolean>) => {
    const res = await fetch(`/api/admin/inbox/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(flags) });
    if (!res.ok) throw new Error(await readError(res, "Update failed"));
  }, []);

  const selectEmail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/admin/inbox/${id}`);
        if (!res.ok) throw new Error(await readError(res, "Failed to open email"));
        const data = await res.json();
        const email: EmailDetail = data.email;
        setSelectedEmail(email);
        setThread(data.thread ?? [email]);

        if (email.direction === "inbound" && !email.isRead) {
          await patchFlags(id, { isRead: true }).catch(() => {});
          const nextStatus = email.status === "received" ? "read" : email.status;
          setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: true, status: nextStatus } : e)));
          setSelectedEmail((prev) => (prev && prev.id === id ? { ...prev, isRead: true, status: nextStatus } : prev));
          setThread((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true, status: nextStatus } : m)));
          setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        }
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Failed to open email");
      } finally {
        setDetailLoading(false);
      }
    },
    [patchFlags]
  );

  // An alert email links to /admin/email?email=<id>: open that conversation
  // once on arrival, then drop the parameter so a refresh or a back/forward
  // doesn't keep reopening it. Read from window (not useSearchParams) so the
  // page needs no Suspense boundary.
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current) return;
    openedFromLink.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("email");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    params.delete("email");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    void selectEmail(id);
  }, [selectEmail]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedEmail(null);
    setThread([]);
    setDetailError(null);
  }, []);

  const applyLocal = useCallback((ids: string[], patch: Partial<EmailListItem>, removeFromFolder = false) => {
    setEmails((prev) =>
      removeFromFolder ? prev.filter((e) => !ids.includes(e.id)) : prev.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e))
    );
    setSelectedEmail((prev) => (prev && ids.includes(prev.id) ? { ...prev, ...(patch as Partial<EmailDetail>) } : prev));
    setThread((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, ...(patch as Partial<EmailDetail>) } : m)));
  }, []);

  const toggleStar = useCallback(
    async (id: string) => {
      const current = emails.find((e) => e.id === id)?.isStarred ?? selectedEmail?.isStarred ?? false;
      const next = !current;
      applyLocal([id], { isStarred: next }, folder === "starred" && !next);
      setCounts((prev) => ({ ...prev, starred: Math.max(0, prev.starred + (next ? 1 : -1)) }));
      try {
        await patchFlags(id, { isStarred: next });
      } catch (err) {
        applyLocal([id], { isStarred: current });
        setCounts((prev) => ({ ...prev, starred: Math.max(0, prev.starred + (next ? -1 : 1)) }));
        showError(err instanceof Error ? err.message : "Could not update star");
      }
    },
    [emails, selectedEmail, folder, applyLocal, patchFlags, showError]
  );

  const markUnread = useCallback(
    async (id: string) => {
      try {
        await patchFlags(id, { isRead: false });
        applyLocal([id], { isRead: false, status: "received" });
        setCounts((prev) => ({ ...prev, unread: prev.unread + 1 }));
        closeDetail();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not mark unread");
      }
    },
    [patchFlags, applyLocal, closeDetail, showError]
  );

  const setSpam = useCallback(
    async (id: string, isSpam: boolean) => {
      try {
        await patchFlags(id, { isSpam });
        const leavesFolder = (folder === "spam") !== isSpam;
        applyLocal([id], { isSpam }, leavesFolder);
        if (leavesFolder && selectedId === id) closeDetail();
        setCounts((prev) => ({ ...prev, spam: Math.max(0, prev.spam + (isSpam ? 1 : -1)) }));
        showSuccess(isSpam ? "Moved to spam" : "Moved back to inbox");
        fetchEmails({ silent: true });
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not update");
      }
    },
    [folder, selectedId, patchFlags, applyLocal, closeDetail, showSuccess, showError, fetchEmails]
  );

  // Deletes always confirm first (page renders the dialog).
  const requestDelete = useCallback((ids: string[]) => {
    if (ids.length) setPendingDelete(ids);
  }, []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = useCallback(async () => {
    const ids = pendingDelete;
    if (!ids?.length) return;
    setBulkActing(true);
    try {
      const res = await fetch("/api/admin/inbox", { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
      if (!res.ok) throw new Error(await readError(res, "Delete failed"));
      setEmails((prev) => prev.filter((e) => !ids.includes(e.id)));
      if (selectedId && ids.includes(selectedId)) closeDetail();
      setSelectedIds(new Set());
      setPendingDelete(null);
      showSuccess(ids.length === 1 ? "Email deleted" : `${ids.length} emails deleted`);
      fetchEmails({ silent: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBulkActing(false);
    }
  }, [pendingDelete, selectedId, closeDetail, showSuccess, showError, fetchEmails]);

  // ── Bulk ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => (prev.size === emails.length && emails.length > 0 ? new Set() : new Set(emails.map((e) => e.id))));
  }, [emails]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulk = useCallback(
    async (action: BulkAction) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (action === "delete") {
        requestDelete(ids);
        return;
      }
      setBulkActing(true);
      try {
        const res = await fetch("/api/admin/inbox", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ ids, action }) });
        if (!res.ok) throw new Error(await readError(res, "Action failed"));
        setSelectedIds(new Set());
        await fetchEmails({ silent: true });
        showSuccess(
          {
            markRead: "Marked as read",
            markUnread: "Marked as unread",
            star: "Starred",
            unstar: "Unstarred",
            spam: "Moved to spam",
            notSpam: "Moved back to inbox",
            delete: "Deleted",
          }[action]
        );
      } catch (err) {
        showError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBulkActing(false);
      }
    },
    [selectedIds, requestDelete, fetchEmails, showSuccess, showError]
  );

  // ── Compose ──
  const openCompose = useCallback((replyTo?: EmailDetail | null) => {
    if (replyTo) {
      setCompose({
        open: true,
        to: replyTo.direction === "inbound" ? replyTo.fromAddress : replyTo.toAddress,
        subject: replySubject(replyTo.subject),
        bodyText: "",
        replyToEmailId: replyTo.id,
        quotedText: quoteText(replyTo),
      });
    } else {
      // Reopen a half-written new email rather than wiping it.
      setCompose((prev) =>
        !prev.replyToEmailId && (prev.to || prev.subject || prev.bodyText) ? { ...prev, open: true } : { ...EMPTY_COMPOSE, open: true }
      );
    }
  }, []);

  const setComposeField = useCallback((field: "to" | "subject" | "bodyText", value: string) => {
    setCompose((prev) => ({ ...prev, [field]: value }));
  }, []);

  /** Hide the window but keep what was typed. */
  const closeCompose = useCallback(() => setCompose((prev) => ({ ...prev, open: false })), []);
  const discardCompose = useCallback(() => setCompose(EMPTY_COMPOSE), []);

  const handleSend = useCallback(async () => {
    const to = compose.to.trim();
    const subject = compose.subject.trim();
    const body = compose.bodyText.trim();
    if (!to || !subject || !body) return;
    setSending(true);
    try {
      const bodyText = compose.quotedText ? `${body}\n\n${compose.quotedText}` : body;
      const res = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ to, subject, bodyText, replyToEmailId: compose.replyToEmailId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to send"));
      const wasReply = compose.replyToEmailId;
      setCompose(EMPTY_COMPOSE);
      showSuccess(wasReply ? "Reply sent" : "Email sent");
      if (wasReply) {
        applyLocal([wasReply], { status: "replied", isRead: true });
        if (selectedId) selectEmail(selectedId);
      }
      fetchEmails({ silent: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }, [compose, selectedId, applyLocal, selectEmail, fetchEmails, showSuccess, showError]);

  // ── AI draft ──
  const useAiDraft = useCallback(
    async (id: string) => {
      setSending(true);
      try {
        const res = await fetch(`/api/admin/inbox/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ useAiDraft: true }) });
        if (!res.ok) throw new Error(await readError(res, "Failed to send draft"));
        showSuccess("AI draft sent");
        applyLocal([id], { status: "replied", isRead: true });
        await selectEmail(id);
        fetchEmails({ silent: true });
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to send draft");
      } finally {
        setSending(false);
      }
    },
    [selectEmail, fetchEmails, applyLocal, showSuccess, showError]
  );

  const editAiDraft = useCallback((email: EmailDetail) => {
    if (!email.aiDraftText) return;
    setCompose({
      open: true,
      to: email.fromAddress,
      subject: replySubject(email.subject),
      bodyText: email.aiDraftText,
      replyToEmailId: email.id,
      quotedText: quoteText(email),
    });
  }, []);

  // ── Test email ──
  const sendTest = useCallback(async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/inbox/test", { method: "POST", headers: JSON_HEADERS });
      if (!res.ok) throw new Error(await readError(res, "Test send failed"));
      const data = await res.json();
      showSuccess(`Test sent to ${data.to}`, "Reply to it from that mailbox and watch the Inbox.");
      fetchEmails({ silent: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setSendingTest(false);
    }
  }, [fetchEmails, showSuccess, showError]);

  const setFolder = useCallback(
    (next: InboxFolder) => {
      setFolderState(next);
      setPage(1);
      setSelectedIds(new Set());
      closeDetail();
    },
    [closeDetail]
  );

  return {
    folder, setFolder, emails, loading, error, search, setSearch, page, setPage, totalPages, total, counts,
    refresh: () => fetchEmails(),
    selectedId, selectedEmail, thread, detailLoading, detailError, selectEmail, closeDetail,
    toggleStar, markUnread, setSpam, requestDelete, cancelDelete, confirmDelete, pendingDelete,
    selectedIds, toggleSelect, selectAllOnPage, clearSelection, bulk, bulkActing,
    useAiDraft, editAiDraft,
    autoReplyEnabled, autoReplyLoading, setAutoReply,
    compose, setComposeField, openCompose, closeCompose, discardCompose, sending, handleSend,
    status, statusLoading, refreshStatus: () => fetchStatus(true), sendTest, sendingTest,
  };
}

export type AdminInbox = ReturnType<typeof useAdminInbox>;
