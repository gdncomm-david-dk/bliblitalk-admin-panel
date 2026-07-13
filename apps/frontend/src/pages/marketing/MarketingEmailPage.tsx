import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { EmailCampaignDTO, MarketingContactDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { FIELD_CLASS, TEXTAREA_CLASS } from "../events/workspace/fieldStyles";
import { PlusIcon, TrashIcon } from "../../components/icons";

interface ContactsResult {
  items: MarketingContactDTO[];
  total: number;
}

export function MarketingEmailPage() {
  const [contacts, setContacts] = useState<ContactsResult | null>(null);
  const [campaigns, setCampaigns] = useState<EmailCampaignDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [extraEmails, setExtraEmails] = useState("");
  const [audience, setAudience] = useState<"selected" | "all">("selected");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadContacts() {
    api
      .get<ContactsResult>("/admin/marketing/contacts?pageSize=100")
      .then(setContacts)
      .catch(() => {});
  }
  function loadCampaigns() {
    api
      .get<EmailCampaignDTO[]>("/admin/marketing/campaigns")
      .then(setCampaigns)
      .catch(() => {});
  }

  useEffect(() => {
    loadContacts();
    loadCampaigns();
  }, []);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onAddContact() {
    if (!newEmail.trim()) return;
    setError(null);
    try {
      await api.post("/admin/marketing/contacts", { email: newEmail.trim(), name: newName.trim() || null });
      setNewEmail("");
      setNewName("");
      loadContacts();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to add contact.");
    }
  }

  async function onRemoveContact(id: string) {
    try {
      await api.delete(`/admin/marketing/contacts/${id}`);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadContacts();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to remove contact.");
    }
  }

  async function onSyncRegistrants() {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.post<{ added: number; skipped: number }>("/admin/marketing/contacts/sync-registrants");
      setNotice(`Synced: ${result.added} added, ${result.skipped} already in your list.`);
      loadContacts();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to sync registrants.");
    } finally {
      setSyncing(false);
    }
  }

  async function onSendCampaign() {
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      const extra = extraEmails
        .split(/[\n,]/)
        .map((e) => e.trim())
        .filter(Boolean);
      const campaign = await api.post<EmailCampaignDTO>("/admin/marketing/campaigns", {
        subject,
        bodyHtml,
        contactIds: audience === "selected" ? Array.from(selected) : [],
        extraEmails: extra,
        audience,
      });
      setNotice(
        `Campaign sent to ${campaign.recipientCount} recipient(s) — ${campaign.sentCount} delivered, ${campaign.failedCount} failed.`,
      );
      setSubject("");
      setBodyHtml("");
      setExtraEmails("");
      setSelected(new Set());
      loadCampaigns();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to send campaign.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Marketing Email</h1>
      <p className="mt-1 text-sm text-muted">
        Build an invite audience from past registrants or contacts you add yourself, then send a blast about
        your next event. Sending requires SMTP to be configured on the API — until then, campaigns are
        recorded but every recipient shows as failed.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Contacts */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Contacts ({contacts?.total ?? 0})</p>
            <button
              onClick={onSyncRegistrants}
              disabled={syncing}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-40"
            >
              {syncing ? "Syncing…" : "Sync from registrants"}
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (optional)"
              className={FIELD_CLASS}
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className={FIELD_CLASS}
            />
            <button
              onClick={onAddContact}
              className="flex shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-white transition-colors hover:bg-primary-dark"
              aria-label="Add contact"
            >
              <PlusIcon width={16} height={16} />
            </button>
          </div>

          <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
            {!contacts || contacts.items.length === 0 ? (
              <p className="py-4 text-sm text-muted">No contacts yet.</p>
            ) : (
              contacts.items.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{c.name ?? c.email}</p>
                    <p className="truncate text-xs text-muted">
                      {c.email} · {c.source}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveContact(c.id)}
                    className="shrink-0 text-muted transition-colors hover:text-status-red"
                    aria-label="Remove contact"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Compose */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Compose Campaign</p>

          <div className="mt-3 flex gap-4 text-sm text-ink">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={audience === "selected"}
                onChange={() => setAudience("selected")}
              />
              Selected contacts ({selected.size})
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={audience === "all"} onChange={() => setAudience("all")} />
              All contacts ({contacts?.total ?? 0})
            </label>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-muted">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD_CLASS} />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-muted">Message (HTML)</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className={`${TEXTAREA_CLASS} h-32`}
              placeholder="<p>You're invited to our next Blibli Talk...</p>"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-muted">
              Extra email addresses (comma or newline separated, optional)
            </label>
            <textarea
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              className={`${TEXTAREA_CLASS} h-16`}
            />
          </div>

          {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}
          {notice && <p className="mt-3 text-sm font-medium text-status-green">{notice}</p>}

          <button
            onClick={onSendCampaign}
            disabled={sending || !subject.trim() || !bodyHtml.trim()}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send Campaign"}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Campaign History</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3">Delivered</th>
              <th className="px-4 py-3">Failed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!campaigns || campaigns.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No campaigns sent yet.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-surface">
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-ink">{c.subject}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {c.sentAt ? dayjs(c.sentAt).format("D MMM YYYY, HH:mm") : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.recipientCount}</td>
                  <td className="px-4 py-3 text-status-green">{c.sentCount}</td>
                  <td className="px-4 py-3 text-status-red">{c.failedCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
