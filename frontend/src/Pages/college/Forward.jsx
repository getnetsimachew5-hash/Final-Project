import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import CollegePortal from "./CollegePortal";
import StatusBadge from "../../components/StatusBadge";
import PaymentRequestStatus from "../../components/PaymentRequestStatus";

const fmt = (n) => (Number(n) || 0).toLocaleString();
const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

/**
 * Function 8 — Forward approved requests to the Academic Vice President Office.
 *
 * One click forwards every individually-approved student of a batch.
 * Batches with undecided or rejected students cannot be forwarded until
 * every student has a decision (enforced by the backend too).
 */
export default function Forward() {
  const [batches, setBatches] = useState([]);
  const [comments, setComments] = useState({});
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const setComment = (id) => (e) =>
    setComments((p) => ({ ...p, [id]: e.target.value }));

  const load = () =>
    api
      .get("/college/batches")
      .then((r) => setBatches(r.data.batches || r.data || []))
      .catch((e) => setErr(apiError(e, "Failed to load batches")))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // Batches that reached the College and still have approved students to send on
  const forwardable = batches.filter((b) => b.status === "pending_college");

  const forward = async (b) => {
    setErr("");
    setSuccess("");
    setBusy(b._id);
    try {
      const res = await api.post(`/college/batches/${b._id}/forward-approved`, {
        comment: (comments[b._id] || "").trim() || undefined,
      });
      setSuccess(
        res.data?.message ||
          "Approved students forwarded to the Academic Vice President Office."
      );
      load();
    } catch (e) {
      setErr(apiError(e, "Failed to forward"));
    } finally {
      setBusy("");
    }
  };

  return (
    <CollegePortal>
      <h1>Forward to Academic Vice President Office</h1>
      <p className="muted">
        Function 8 — send every student you approved to the next office. Batches
        where some students are still undecided or rejected must be completed
        first (in “Review &amp; Approve”).
      </p>

      {err && <p className="error">{err}</p>}
      {success && <p className="notice-ok">✅ {success}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && forwardable.length === 0 && (
        <p className="muted">
          Nothing to forward right now. Requests from the CS Department appear
          in <Link to="/college/pending">Review &amp; Approve</Link> first.
        </p>
      )}

      {forwardable.map((b) => {
        const requests = b.requests || [];
        const approved = requests.filter(
          (r) => r.status === "college_approved"
        ).length;
        const undecided = requests.filter(
          (r) => r.status === "pending_college"
        ).length;
        const rejected = requests.filter((r) => r.status === "rejected").length;
        const missingUndecided = requests.filter(
          (r) => r.status === "pending_college" && Array.isArray(r.missingInfo) && r.missingInfo.length > 0
        ).length;
        const canForward = approved > 0 && undecided === 0 && missingUndecided === 0;

        return (
          <div key={b._id} className="batch-card">
            <div className="batch-head">
              <h3>{b.batchName}</h3>
              <StatusBadge status={b.status} />
              <span className="muted">
                {b.semester} · {b.academicYear}
              </span>
            </div>

            <p>
              <b>{requests.length}</b> student(s) —{" "}
              <span className="chip ok">approved {approved}</span>{" "}
              <span className="chip bad">rejected {rejected}</span>{" "}
              <span className="chip">not decided {undecided}</span>
              {missingUndecided > 0 && (
                <span className="chip warn">missing info {missingUndecided}</span>
              )}
            </p>

            <ul className="student-review-list">
              {requests.map((r) => {
                const missing = Array.isArray(r.missingInfo) ? r.missingInfo : [];
                return (
                  <li key={r._id} className="student-review-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', width: '100%' }}>
                      <span className="student-name">
                        {r.student?.fullName || "—"}
                      </span>
                      <small className="muted">{r.student?.institutionalId}</small>
                      <small className="muted">
                        {r.student?.program || "—"} ·{" "}
                        {r.student?.year ? "Year " + r.student.year : "—"} · 📞{" "}
                        {r.student?.phone || "—"} · ✉️ {r.student?.email || "—"}
                      </small>
                      {r.amount != null && (
                        <span className="chip">{fmt(r.amount)} ETB</span>
                      )}
                      <PaymentRequestStatus status={r.status} />
                    </div>
                    {missing.length > 0 && (
                      <div style={{ width: '100%', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', padding: '0.4rem 0.55rem', fontSize: '0.8rem', color: '#9a3412' }}>
                        <strong>Missing:</strong> {missing.join(', ')}
                        {r.missingInfoRequestedAt && <span style={{ marginLeft: '0.4rem', color: '#b45309' }}>(notified {new Date(r.missingInfoRequestedAt).toLocaleString()})</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <textarea
              className="comment"
              placeholder="Optional note to the Academic VP (e.g. context about the batch)."
              value={comments[b._id] || ""}
              onChange={setComment(b._id)}
            />

            <div className="batch-actions">
              <button
                className="btn primary"
                disabled={!canForward || busy === b._id}
                onClick={() => forward(b)}
              >
                {busy === b._id
                  ? "Forwarding…"
                  : canForward
                  ? `Forward ${approved} approved student(s) → Academic VP`
                  : missingUndecided > 0
                  ? "Fix missing info / notify students first"
                  : "Decide on every student first"}
              </button>
            </div>
          </div>
        );
      })}
    </CollegePortal>
  );
}
