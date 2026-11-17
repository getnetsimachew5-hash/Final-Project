import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import AdminVPPortal from './AdminVPPortal';
import {
  DashboardPage,
  DashboardHero,
  DashboardSnapshot,
} from '../../components/DashboardUI';
import AdminVPStepper from './steps/AdminVPStepper';
import Step1Endorsed from './steps/Step1Endorsed';
import Step2Requirements from './steps/Step2Requirements';
import Step3Payment from './steps/Step3Payment';
import Step4Decision from './steps/Step4Decision';
import Step5Comment from './steps/Step5Comment';
import Step6Forward from './steps/Step6Forward';
import Step7History from './steps/Step7History';

const apiError = (e, fallback) =>
  e.response?.data?.errors?.[0]?.msg || e.response?.data?.message || fallback;

const fmt = (n) => (Number(n) || 0).toLocaleString();

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const totalOf = (b) =>
  Number(b?.totalAmount) ||
  (b?.requests || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

/**
 * Administrative VP guided workflow.
 *
 * Runs the seven functions in order, each implemented in its own file under
 * `./steps/`:
 *   1 View endorsed → 2 Review requirements → 3 Confirm payment →
 *   4 Decide → 5 Comment → 6 Forward → 7 History
 *
 * Integration with the other actors lives in the backend workflow service:
 * the Academic VP's endorsement puts the batch at `pending_admin_vp`; the
 * forward endpoint moves it straight to `pending_finance` and notifies Finance.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Values collected while walking through the steps.
  const [acknowledged, setAcknowledged] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [fundsConfirmed, setFundsConfirmed] = useState(false);
  const [decision, setDecision] = useState('');
  const [comment, setComment] = useState('');

  const load = async () => {
    setLoading(true);
    setListError('');
    try {
      const [res, historyRes] = await Promise.all([
        api.get('/admin-vp/batches'),
        api.get('/admin-vp/history'),
      ]);
      setBatches(res.data.batches || []);
      const done = (historyRes.data.batches || []).filter((batch) => (
        batch.status !== 'pending_admin_vp'
        && (
          batch.adminVpForwardedAt
          || batch.adminVpDecision === 'rejected'
          || batch.status === 'pending_finance'
          || batch.status === 'paid'
          || batch.status === 'rejected'
        )
      ));
      setCompleted(done);
    } catch (e) {
      setListError(apiError(e, 'Failed to load academically endorsed requests'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const mergeSelected = (updated) => {
    if (!updated) return;
    setSelected((prev) => (prev ? { ...prev, ...updated } : updated));
  };

  const selectBatch = (batch) => {
    setError('');
    setSuccess('');
    setSelected(batch);
    setAcknowledged(Boolean(batch.paymentConfirmedAt));
    setAmount(String(batch.authorizedAmount ?? totalOf(batch) ?? ''));
    setReference(batch.paymentReference || '');
    setFundsConfirmed(Boolean(batch.paymentConfirmedAt));
    setDecision(
      batch.adminVpDecision === 'approved'
        ? 'approve'
        : batch.adminVpDecision === 'rejected'
          ? 'reject'
          : ''
    );
    setComment(batch.adminVpComment || '');

    // Resume exactly where this request stopped.
    if (batch.adminVpForwardedAt || batch.status !== 'pending_admin_vp') setStep(7);
    else if (batch.adminVpDecision === 'approved') setStep(6);
    else if (batch.adminVpDecision === 'rejected') setStep(7);
    else if (batch.paymentConfirmedAt) setStep(4);
    else setStep(2);
  };

  const resetWorkflow = () => {
    setSelected(null);
    setStep(1);
    setAcknowledged(false);
    setAmount('');
    setReference('');
    setFundsConfirmed(false);
    setDecision('');
    setComment('');
    setError('');
    setSuccess('');
    load();
  };

  const back = () => {
    if (busy) return;
    setError('');
    setSuccess('');
    setStep((s) => Math.max(1, s - 1));
  };

  const next = async () => {
    setError('');

    if (step === 1) {
      if (!selected) {
        setError('Select an academically endorsed request to begin the review.');
        return;
      }
      setSuccess('');
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!acknowledged) {
        setError('Tick the review confirmation before confirming payment.');
        return;
      }
      setSuccess('');
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!(Number(amount) > 0)) {
        setError('Enter the amount of money authorized for this batch.');
        return;
      }
      if (!fundsConfirmed) {
        setError('Confirm that the funds are available and authorized.');
        return;
      }

      setBusy(true);
      setSuccess('');
      try {
        const res = await api.post(
          `/admin-vp/batches/${selected._id}/confirm-payment`,
          {
            authorizedAmount: Number(amount),
            paymentReference: reference.trim() || undefined,
          }
        );
        mergeSelected(res.data.batch);
        setSuccess(res.data.message || 'Payment availability confirmed.');
        setStep(4);
        load();
      } catch (e) {
        setError(apiError(e, 'Failed to confirm payment availability'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 4) {
      if (!decision) {
        setError('Choose Approve or Reject.');
        return;
      }
      setSuccess('');
      setStep(5);
      return;
    }

    if (step === 5) {
      if (comment.trim().length < 5) {
        setError('A comment of at least 5 characters is required.');
        return;
      }

      setBusy(true);
      setSuccess('');
      try {
        const action = decision === 'approve' ? 'approve' : 'reject';
        const res = await api.post(
          `/admin-vp/batches/${selected._id}/${action}`,
          { comment: comment.trim() }
        );
        mergeSelected(res.data.batch);
        setSuccess(res.data.message || 'Decision recorded.');
        setStep(6);
        load();
      } catch (e) {
        setError(apiError(e, 'Failed to save the decision'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 6) {
      const alreadyForwarded =
        Boolean(selected?.adminVpForwardedAt) || selected?.status !== 'pending_admin_vp';

      if (decision === 'reject' || selected?.adminVpDecision === 'rejected' || alreadyForwarded) {
        setSuccess('');
        setStep(7);
        return;
      }

      setBusy(true);
      setSuccess('');
      try {
        const res = await api.post(`/admin-vp/batches/${selected._id}/forward`);
        mergeSelected(res.data.batch);
        setSuccess(res.data.message || 'Batch forwarded to Finance.');
        setStep(7);
        load();
      } catch (e) {
        setError(apiError(e, 'Failed to forward the batch'));
      } finally {
        setBusy(false);
      }
    }
  };

  const nextLabel = (() => {
    if (step === 1) return 'Start review →';
    if (step === 2) return 'Confirm payment →';
    if (step === 3) return busy ? 'Saving…' : 'Save & continue →';
    if (step === 4) return 'Add comment →';
    if (step === 5) {
      if (busy) return 'Submitting…';
      return decision === 'reject' ? 'Reject & continue' : 'Approve & continue';
    }
    if (step === 6) {
      if (decision === 'reject' || selected?.adminVpDecision === 'rejected') {
        return 'View approval history →';
      }
      if (selected?.adminVpForwardedAt || selected?.status !== 'pending_admin_vp') {
        return 'View approval history →';
      }
      return busy ? 'Forwarding…' : 'Forward to Finance';
    }
    return 'Start another request';
  })();

  const pendingCount = batches.length;
  const selectedAmount = selected ? totalOf(selected) : 0;
  const workflowPercent = Math.round((step / 7) * 100);
  const displayName = user?.fullName || 'Officer';

  return (
    <AdminVPPortal>
      <DashboardPage theme="adminvp">
        <div className="vp-flow">
          <DashboardHero
            badge={`📅 ${TODAY_LABEL}`}
            title={`Welcome back, ${displayName}`}
            description="Administrative authorization and budget confirmation before Finance processes payment. Follow the seven functions in order for each academically endorsed request."
            actions={[
              { to: '/admin-vp/endorsed', label: 'Open endorsed requests', icon: '📥', variant: 'light' },
              { to: '/admin-vp/history', label: 'Approval history', icon: '🕘' },
            ]}
            snapshot={(
              <DashboardSnapshot
                label="Current review"
                value={selected?.batchName || 'Select a request'}
                meta={[
                  `Step ${step} of 7`,
                  `${pendingCount} endorsed batch${pendingCount === 1 ? '' : 'es'}`,
                  selected ? `${fmt(selectedAmount)} ETB` : 'No batch selected',
                ]}
                progress={workflowPercent}
                progressLabel="Workflow progress"
                foot={[
                  { label: 'step', value: `${step}/7` },
                  { label: 'batches', value: pendingCount },
                  { label: 'flow', value: 'AVP → Admin VP → Finance' },
                ]}
              />
            )}
          />

          <AdminVPStepper current={step} />

        {error && <p className="error vp-alert">{error}</p>}
        {success && <p className="notice-ok vp-alert">✅ {success}</p>}

        <section className="vp-panel" aria-live="polite">
          {step === 1 && (
            <Step1Endorsed
              batches={batches}
              completed={completed}
              loading={loading}
              error={listError}
              selectedId={selected?._id}
              onSelect={selectBatch}
              onRefresh={load}
            />
          )}

          {step === 2 && selected && (
            <Step2Requirements
              key={selected._id}
              batch={selected}
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
            />
          )}

          {step === 3 && selected && (
            <Step3Payment
              batch={selected}
              amount={amount}
              reference={reference}
              confirmed={fundsConfirmed}
              onAmount={setAmount}
              onReference={setReference}
              onConfirmed={setFundsConfirmed}
            />
          )}

          {step === 4 && selected && (
            <Step4Decision decision={decision} onDecision={setDecision} />
          )}

          {step === 5 && selected && (
            <Step5Comment
              batch={selected}
              decision={decision}
              comment={comment}
              onComment={setComment}
            />
          )}

          {step === 6 && selected && (
            <Step6Forward batch={selected} decision={decision} busy={busy} />
          )}

          {step === 7 && selected && (
            <Step7History
              key={`history-${selected._id}`}
              batchId={selected._id}
              onStartAnother={resetWorkflow}
            />
          )}
        </section>

        <nav className="vp-nav" aria-label="Workflow navigation">
          <button
            type="button"
            className="btn secondary"
            onClick={back}
            disabled={step === 1 || step >= 6 || busy}
          >
            ← Back
          </button>

          <span className="vp-nav-position">Step {step} of 7</span>

          {step < 7 ? (
            <button
              type="button"
              className="btn primary"
              onClick={next}
              disabled={busy}
            >
              {nextLabel}
            </button>
          ) : (
            <span className="vp-nav-complete">✓ Workflow complete</span>
          )}
        </nav>
        </div>
      </DashboardPage>
    </AdminVPPortal>
  );
}
