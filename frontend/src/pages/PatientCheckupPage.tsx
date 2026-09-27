import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  Sparkles,
  Calendar,
} from "lucide-react";
import {
  createPatientLog,
  deleteMyLog,
  listMyLogs,
  updateMyLog,
} from "../services/firestore";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { Field } from "../components/ui/Field";
import { Textarea } from "../components/ui/Textarea";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonLines } from "../components/ui/Skeleton";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/toast-context";
import { dateOnly, relativeTime } from "../lib/format";
import type { PatientLog, UserData } from "../types";

const DRAFT_KEY = "arogyaai.diary.draft";

const SEVERITY = [
  { value: 1, label: "Mild" },
  { value: 2, label: "Mild+" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Strong" },
  { value: 5, label: "Severe" },
];

/** Quick-pick tags. These are the patient's own words to organise their diary,
 *  not a clinical classification, and are shown here purely as shortcuts. */
const TAGS = [
  "Headache",
  "Digestion",
  "Sleep",
  "Energy",
  "Pain",
  "Breathing",
  "Skin",
  "Mood",
];

interface Draft {
  symptoms: string;
  severity: number | null;
  tags: string[];
  onset: string;
}

const EMPTY_DRAFT: Draft = { symptoms: "", severity: null, tags: [], onset: "" };

/**
 * The patient's symptom diary.
 *
 * Entries are their own record: they write, edit and delete them, and a clinic
 * practitioner reads the same entries through the clinic. A draft is kept in
 * localStorage so a half-written entry is not lost if the patient navigates
 * away, and is cleared once the entry is saved.
 *
 * The structured fields (severity, tags, onset) exist to make a diary entry
 * comparable over time. They are optional — an entry is valid with words alone.
 */
export default function PatientCheckup({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Editing state: the id currently open for edit, and its working copy.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);

  // Deletion state: the entry awaiting confirmation.
  const [pendingDelete, setPendingDelete] = useState<PatientLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const linked = Boolean(userData?.patientId);

  // Restore a draft on mount so a half-written entry survives navigation.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        setDraft({
          symptoms: parsed.symptoms ?? "",
          severity: parsed.severity ?? null,
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          onset: parsed.onset ?? "",
        });
      }
    } catch {
      // A corrupt draft is discarded rather than blocking the page.
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  // Persist the draft as it changes.
  useEffect(() => {
    if (draft.symptoms.trim() || draft.severity || draft.tags.length || draft.onset) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [draft]);

  const loadLogs = async () => {
    if (!user) {
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);
    try {
      setLogs(await listMyLogs(user.uid));
    } catch (e) {
      console.error("Could not load your diary:", e);
      toast.error("Could not load your diary entries. Please refresh to retry.");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const clearDraft = () => {
    setDraft(EMPTY_DRAFT);
    localStorage.removeItem(DRAFT_KEY);
  };

  const toggleTag = (tag: string) =>
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag)
        ? d.tags.filter((t) => t !== tag)
        : [...d.tags, tag],
    }));

  const handleSave = async () => {
    if (!draft.symptoms.trim()) {
      toast.error("Please describe how you are feeling before saving.");
      return;
    }
    if (!user || !userData) {
      toast.error("You must be signed in to save an entry.");
      return;
    }
    if (!userData.clinicId) {
      toast.error("Your account is not linked to a clinic. Please sign in again.");
      return;
    }
    setIsSaving(true);
    try {
      await createPatientLog(
        user.uid,
        user.email,
        userData.clinicId,
        draft.symptoms,
        userData.patientId,
        {
          severity: draft.severity ?? undefined,
          tags: draft.tags,
          onset: draft.onset || undefined,
        },
      );
      clearDraft();
      toast.success("Saved to your health diary.");
      await loadLogs();
    } catch (err) {
      console.error("Error saving log:", err);
      toast.error("Failed to save your entry. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const beginEdit = (log: PatientLog) => {
    setEditingId(log.id);
    setEditDraft({
      symptoms: log.symptoms ?? "",
      severity: log.severity ?? null,
      tags: log.tags ?? [],
      onset: log.onset ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editDraft.symptoms.trim()) {
      toast.error("An entry cannot be saved empty.");
      return;
    }
    setSavingEdit(true);
    try {
      await updateMyLog(editingId, {
        symptoms: editDraft.symptoms,
        severity: editDraft.severity ?? undefined,
        tags: editDraft.tags,
        onset: editDraft.onset || undefined,
      });
      setEditingId(null);
      toast.success("Your entry has been updated.");
      await loadLogs();
    } catch (e) {
      console.error("Could not update the entry:", e);
      toast.error("Could not update your entry. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteMyLog(pendingDelete.id);
      toast.success("Your entry has been deleted.");
      setPendingDelete(null);
      await loadLogs();
    } catch (e) {
      console.error("Could not delete the entry:", e);
      toast.error("Could not delete your entry. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const charCount = useMemo(() => draft.symptoms.trim().length, [draft.symptoms]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-6 md:p-10"
    >
      <PageHeader
        title="Symptom Diary"
        subtitle="Record how you are feeling, and revisit what you have noted."
      />

      <SectionCard
        title="New entry"
        icon={<Pencil size={22} />}
        iconTone="bg-emerald-100 text-emerald-600"
        description="A few words is enough. Everything here is optional except the description."
      >
        <div className="space-y-6">
          <div className="flex items-start gap-3 bg-blue-50 text-blue-800 p-4 rounded-2xl border border-blue-100">
            <Shield size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs font-medium leading-relaxed">
              Entries are sent to Clinic ID <strong>{userData?.clinicId}</strong>.
              Security rules restrict access to your own account and your clinic's
              practitioners.
            </p>
          </div>

          {!linked && (
            <div className="flex items-start gap-3 bg-amber-50 text-amber-800 p-4 rounded-2xl border border-amber-200">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs font-medium leading-relaxed">
                Your account is not yet linked to a patient record, so this entry
                will reach your clinic but will not appear in your personal history
                until you add your patient code in Settings.
              </p>
            </div>
          )}

          <Field
            label="How are you feeling?"
            required
            hint={
              <span className="flex items-center justify-between gap-3">
                <span>
                  Describe any pain, discomfort, sleep or digestive changes you
                  have noticed.
                </span>
                <span className="tabular-nums">{charCount} chars</span>
              </span>
            }
          >
            <Textarea
              value={draft.symptoms}
              onChange={(e) => setDraft({ ...draft, symptoms: e.target.value })}
              rows={6}
              placeholder="e.g. I have had a mild headache for two days and my digestion feels sluggish…"
            />
          </Field>

          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
              Quick tags{" "}
              <span className="normal-case tracking-normal font-medium">
                (optional)
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => {
                const active = draft.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                Severity{" "}
                <span className="normal-case tracking-normal font-medium">
                  (optional)
                </span>
              </p>
              <div className="flex gap-2">
                {SEVERITY.map((s) => {
                  const active = draft.severity === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          severity: active ? null : s.value,
                        })
                      }
                      aria-pressed={active}
                      title={s.label}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-colors ${
                        active
                          ? "bg-slate-950 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {s.value}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs font-medium text-slate-400 mt-2">
                {draft.severity
                  ? SEVERITY.find((s) => s.value === draft.severity)?.label
                  : "1 = mild, 5 = severe"}
              </p>
            </div>

            <Field label="When did it start?" hint="Optional. Defaults to today.">
              <Input
                type="date"
                value={draft.onset}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, onset: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              size="lg"
              icon={<CheckCircle2 size={20} />}
              loading={isSaving}
              disabled={!draft.symptoms.trim()}
              onClick={handleSave}
              className="flex-1"
            >
              {isSaving ? "Saving…" : "Save to diary"}
            </Button>
            {(draft.symptoms.trim() || draft.severity || draft.tags.length > 0) && (
              <Button
                variant="ghost"
                size="lg"
                onClick={clearDraft}
                disabled={isSaving}
                title="Discard this draft"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Your entries"
        icon={<Calendar size={22} />}
        iconTone="bg-amber-100 text-amber-600"
        description={
          logsLoading ? "Loading…" : `${logs.length} recorded`
        }
      >
        {logsLoading ? (
          <SkeletonLines count={3} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={36} />}
            title="No entries yet"
            description="Your first entry will appear here, and will be visible to your clinic straight away."
          />
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => {
              const isEditing = editingId === log.id;
              return (
                <li
                  key={log.id}
                  className="bg-slate-50 rounded-2xl border border-slate-100 p-5"
                >
                  {isEditing ? (
                    <div className="space-y-4">
                      <Textarea
                        value={editDraft.symptoms}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, symptoms: e.target.value })
                        }
                        rows={4}
                        aria-label="Edit entry description"
                      />
                      <div className="flex flex-wrap gap-2">
                        {TAGS.map((tag) => {
                          const active = editDraft.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setEditDraft({
                                  ...editDraft,
                                  tags: active
                                    ? editDraft.tags.filter((t) => t !== tag)
                                    : [...editDraft.tags, tag],
                                })
                              }
                              aria-pressed={active}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                active
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-600 border border-slate-200"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                          Severity
                        </label>
                        <div className="flex gap-1.5">
                          {SEVERITY.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() =>
                                setEditDraft({
                                  ...editDraft,
                                  severity:
                                    editDraft.severity === s.value ? null : s.value,
                                })
                              }
                              aria-pressed={editDraft.severity === s.value}
                              className={`w-9 h-9 rounded-lg text-sm font-black transition-colors ${
                                editDraft.severity === s.value
                                  ? "bg-slate-950 text-white"
                                  : "bg-white text-slate-500 border border-slate-200"
                              }`}
                            >
                              {s.value}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          size="sm"
                          variant="success"
                          loading={savingEdit}
                          onClick={saveEdit}
                        >
                          Save changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          disabled={savingEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Calendar size={12} /> {dateOnly(log.createdAt)}
                          </span>
                          {log.severity && (
                            <Badge tone="neutral">Severity {log.severity}/5</Badge>
                          )}
                          {log.updatedAt && <Badge tone="info">Edited</Badge>}
                          {!log.patientId && <Badge tone="warning">Not linked</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => beginEdit(log)}
                            aria-label="Edit this entry"
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(log)}
                            aria-label="Delete this entry"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="text-slate-700 font-medium text-sm leading-relaxed">
                        {log.symptoms}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-3">
                        {log.tags?.map((t) => (
                          <span
                            key={t}
                            className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg"
                          >
                            {t}
                          </span>
                        ))}
                        {log.onset && (
                          <span className="text-xs font-medium text-slate-400">
                            Started {log.onset}
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-400">
                          · logged {relativeTime(log.createdAt)}
                        </span>
                      </div>
                      {!log.patientId && (
                        <p className="text-xs font-semibold text-amber-700 mt-3">
                          Your clinic can see this entry; link your record in
                          Settings to attach it to your history.
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this entry?"
        message="This removes the entry from your diary and from your clinic's view. It cannot be undone."
        confirmLabel="Delete entry"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </motion.div>
  );
}
