import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import FinancePortal from './FinancePortal';
import StatusBadge from '../../components/StatusBadge';
import {
  DashboardPage,
  DashboardHero,
  DashboardSnapshot,
} from '../../components/DashboardUI';
import FinanceStepper from './steps/FinanceStepper';
import Step1Approved from './steps/Step1Approved';
import Step2Review from './steps/Step2Review';
import Step3Amount from './steps/Step3Amount';
import Step4Individual from './steps/Step4Individual';
import Step5Batch from './steps/Step5Batch';
import Step6Simulate from './steps/Step6Simulate';
import Step7Reference from './steps/Step7Reference';
import Step8Confirm from './steps/Step8Confirm';
import Step9Paid from './steps/Step9Paid';
import Step10Reports from './steps/Step10Reports';
import { apiError, money, paymentModeLabel } from './steps/helpers';

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * Finance guided workflow.
 *
 * Runs the ten Finance Office functions in order, each implemented in its own
 * file under `./steps/`:
 *   1 View approved → 2 Review info → 3 Confirm amount → 4 Individual →
 *   5 Batch → 6 Simulate TeleBirr → 7 Reference → 8 Confirm →
 *   9 PAID → 10 Reports & history
 *
 * Integration: the Administrative VP forwards the batch at `pending_finance`;
 * the final step moves it to `paid`, notifies the student via TeleBirr, and
 * notifies the other offices through the existing workflow service.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [overview, setOverview] = useState({ batches: [], pendingBatches: 0, paidBatches: 0 });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [amountData, setAmountData] = useState(null);
  const [amountConfirmed, setAmountConfirmed] = useState(false);
  const [mode, setMode] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [session, setSession] = useState(null);
  const [otpByTransaction, setOtpByTransaction] = useState({});
  const [confirmation, setConfirmation] = useState(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await api.get('/finance/batches');
      setBatches(response.data.batches || []);
      try {
        const overviewResponse = await api.get('/finance/overview');
        setOverview(overviewResponse.data || { batches: [] });
      } catch {
        // The guided workflow still works if the overview cannot be loaded.
        setOverview({ batches: [] });
      }
    } catch (e) {
      setListError(apiError(e, 'Failed to load approved payment requests'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const mergeSelected = useCallback((updated) => {
    if (!updated) return;
    setSelected((previous) => (previous ? { ...previous, ...updated } : updated));
    setBatches((previous) =>
      previous.map((batch) => (batch._id === updated._id ? { ...batch, ...updated } : batch))
    );
  }, []);

  const loadSession = useCallback(async (batchId) => {
    const response = await api.get(`/finance/batches/${batchId}/session`);
    const data = response.data;
    setSession(data);

    const defaults = {};
    for (const transaction of data.transactions || []) {
      if (transaction.otp) defaults[transaction.transactionId] = transaction.otp;
    }
    setOtpByTransaction((previous) => ({ ...defaults, ...previous }));
    return data;
  }, []);

  // Reload the full batch record (including paid requests) after a payment
  // changes a request status. /batches/:id only returns pending requests,
  // which would leave the UI showing an already-paid student as unpaid.
  const refreshSelected = useCallback(async (batchId) => {
    const response = await api.get(`/finance/batches/${batchId}/history`);
    mergeSelected({
      ...response.data.batch,
      requests: response.data.requests || [],
    });
    return response.data;
  }, [mergeSelected]);

  const resetWorkflow = () => {
    setSelected(null);
    setStep(1);
    setPreparing(false);
    setBusy(false);
    setError('');
    setSuccess('');
    setReviewConfirmed(false);
    setAmountData(null);
    setAmountConfirmed(false);
    setMode('');
    setSelectedRequestId('');
    setSession(null);
    setOtpByTransaction({});
    setConfirmation(null);
    loadBatches();
  };

  const selectBatch = async (batch) => {
    setError('');
    setSuccess('');
    setPreparing(true);
    setSelected(batch);
    setReviewConfirmed(Boolean(batch.financeReviewConfirmedAt));
    setAmountData(null);
    setAmountConfirmed(Boolean(batch.financeAmountConfirmedAt));
    setMode(batch.financePaymentMode || '');
    setSelectedRequestId(
      typeof batch.financeSelectedRequest === 'string'
        ? batch.financeSelectedRequest
        : batch.financeSelectedRequest?._id || ''
    );
    setSession(null);
    setOtpByTransaction({});
    setConfirmation(null);

    try {
      const sessionData = await loadSession(batch._id);
      if (!batch.financePaymentMode && sessionData.mode) setMode(sessionData.mode);
      if (!batch.financeSelectedRequest && sessionData.selectedRequest) {
        setSelectedRequestId(sessionData.selectedRequest);
      }

      const pendingRequests = (batch.requests || []).filter(
        (request) => request.status === 'pending_finance'
      );
      const hasAwaitingOtp = (sessionData.transactions || []).some(
        (transaction) => transaction.status === 'otp_sent'
      );
      const selectedField = typeof batch.financeSelectedRequest === 'string'
        ? batch.financeSelectedRequest
        : batch.financeSelectedRequest?._id || '';
      const selectedAlreadyPaid =
        batch.financePaymentMode === 'individual' &&
        selectedField &&
        !pendingRequests.some((request) => String(request._id) === String(selectedField));

      // Every student may have been paid through the Individual Payment page
      // while the batch itself was never committed. Repair it before showing
      // the workflow instead of trapping the officer on an empty batch.
      if (pendingRequests.length === 0 && (batch.requests || []).length === 0) {
        try {
          const result = await api.post(`/finance/batches/${batch._id}/finalize`);
          if (result.data?.batch) {
            mergeSelected(result.data.batch);
            setSuccess(result.data.message || '');
            if (result.data.batch.status === 'paid') {
              setStep(10);
              return;
            }
          }
        } catch {
          // Fall through to the normal branch; the relevant error is shown by
          // the step that needs attention.
        }
      }

      if (batch.status === 'paid' || batch.financePaidAt) {
        setStep(10);
      } else if (batch.financeSimulatedAt && !batch.financeReference) {
        setStep(7);
      } else if (hasAwaitingOtp) {
        setStep(8);
      } else if (batch.financePaymentConfirmedAt && pendingRequests.length > 0 && selectedAlreadyPaid) {
        // Individual payment completed for one student; start the next cycle.
        setMode('');
        setSelectedRequestId('');
        setSession(null);
        setOtpByTransaction({});
        setConfirmation(null);
        setStep(4);
      } else if (batch.financePaymentConfirmedAt) {
        setStep(9);
      } else if (batch.financeReference) {
        setStep(8);
      } else if (batch.financeSimulatedAt) {
        setStep(7);
      } else if (batch.financePaymentMode) {
        setStep(5);
      } else if (batch.financeAmountConfirmedAt) {
        setStep(4);
      } else if (batch.financeReviewConfirmedAt) {
        setStep(3);
      } else {
        setStep(2);
      }
    } catch (e) {
      setError(apiError(e, 'Failed to prepare the payment workflow'));
      setStep(2);
    } finally {
      setPreparing(false);
    }
  };

  const back = () => {
    if (busy || preparing) return;
    setError('');
    setSuccess('');
    setStep((current) => Math.max(1, current - 1));
  };

  const next = async () => {
    if (busy || preparing) return;
    setError('');
    setSuccess('');

    if (step === 1) {
      if (!selected) {
        setError('Select an approved payment request to begin.');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!reviewConfirmed) {
        setError('Confirm that the payment information has been reviewed before continuing.');
        return;
      }

      if (!selected?.financeReviewConfirmedAt) {
        setBusy(true);
        try {
          const response = await api.post(`/finance/batches/${selected._id}/review`, {
            confirmed: true,
          });
          mergeSelected(response.data.batch);
          setSuccess(response.data.message);

          // The review endpoint finalises a batch whose students were all
          // already paid individually. Do not send it into amount calculation.
          if (response.data.batch?.status === 'paid') {
            setStep(10);
            return;
          }
        } catch (e) {
          setError(apiError(e, 'Failed to confirm the payment information'));
          setBusy(false);
          return;
        } finally {
          setBusy(false);
        }
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!amountConfirmed) {
        setError('Confirm the calculated payment amount before continuing.');
        return;
      }

      let calculation = amountData;
      setBusy(true);
      try {
        if (!calculation) {
          const response = await api.get(`/finance/batches/${selected._id}/amount`);
          calculation = response.data;
          setAmountData(calculation);
        }

        if (!selected?.financeAmountConfirmedAt) {
          const response = await api.post(`/finance/batches/${selected._id}/amount`, {
            confirmedAmount: calculation.summary.totalAmount,
          });
          mergeSelected(response.data.batch);
          setSuccess(response.data.message);
        }
        setStep(4);
      } catch (e) {
        setError(apiError(e, 'Failed to confirm the payment amount'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 4) {
      if (!mode) {
        setError('Choose individual or batch payment before continuing.');
        return;
      }
      if (mode === 'individual' && !selectedRequestId) {
        setError('Choose the student whose payment should be processed individually.');
        return;
      }

      const savedMode = selected?.financePaymentMode;
      const savedRequest = typeof selected?.financeSelectedRequest === 'string'
        ? selected.financeSelectedRequest
        : selected?.financeSelectedRequest?._id || '';
      const modeChanged =
        !savedMode ||
        savedMode !== mode ||
        (mode === 'individual' && savedRequest !== String(selectedRequestId));

      if (modeChanged) {
        setBusy(true);
        try {
          const response = await api.post(`/finance/batches/${selected._id}/mode`, {
            mode,
            requestId: mode === 'individual' ? selectedRequestId : undefined,
          });
          mergeSelected(response.data.batch);
          setSuccess(response.data.message);
        } catch (e) {
          setError(apiError(e, 'Failed to save the payment method'));
          setBusy(false);
          return;
        } finally {
          setBusy(false);
        }
      }
      setStep(5);
      return;
    }

    if (step === 5) {
      if (!mode) {
        setError('Choose a payment method in step 4 first.');
        return;
      }

      setBusy(true);
      try {
        let currentSession = session;
        if (!selected?.financeSimulatedAt || !(currentSession?.transactions || []).length) {
          const response = await api.post(`/finance/batches/${selected._id}/simulate`);
          mergeSelected(response.data.batch);
          currentSession = {
            mode: response.data.mode,
            transactions: response.data.transactions || [],
            errors: response.data.errors || [],
          };
          setSession((previous) => ({ ...previous, ...currentSession }));
          const defaults = {};
          for (const transaction of currentSession.transactions) {
            if (transaction.otp) defaults[transaction.transactionId] = transaction.otp;
          }
          setOtpByTransaction((previous) => ({ ...defaults, ...previous }));
          setSuccess(
            `TeleBirr simulated for ${response.data.simulatedCount} student(s).` +
            (response.data.errors?.length
              ? ` ${response.data.errors.length} student(s) need attention.`
              : '')
          );
        }
        setStep(6);
      } catch (e) {
        setError(apiError(e, 'Failed to simulate the TeleBirr payment'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 6) {
      setBusy(true);
      try {
        if (!selected?.financeReference) {
          const response = await api.post(`/finance/batches/${selected._id}/reference`);
          mergeSelected(response.data.batch);
          setSession((previous) => ({ ...previous, reference: response.data.reference }));
          setSuccess(response.data.message);
        }
        setStep(7);
      } catch (e) {
        setError(apiError(e, 'Failed to generate the payment reference'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 7) {
      setBusy(true);
      try {
        // Normally the reference is generated when leaving step 6. This fallback
        // keeps a resumed workflow safe if only the simulation was recorded.
        if (!selected?.financeReference) {
          const response = await api.post(`/finance/batches/${selected._id}/reference`);
          mergeSelected(response.data.batch);
          setSession((previous) => ({ ...previous, reference: response.data.reference }));
          setSuccess(response.data.message);
        }
        setStep(8);
      } catch (e) {
        setError(apiError(e, 'Failed to generate the payment reference'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 8) {
      const awaitingOtp = (session?.transactions || []).some(
        (transaction) => transaction.status === 'otp_sent'
      );

      setBusy(true);
      try {
        if (awaitingOtp || !selected?.financePaymentConfirmedAt) {
          const response = await api.post(`/finance/batches/${selected._id}/confirm`, {
            otpByTransaction,
          });
          setConfirmation(response.data);
          await refreshSelected(selected._id);
          if (response.data.successCount < response.data.totalCount) {
            const failed = (response.data.results || []).filter((result) => !result.success);
            setOtpByTransaction({});
            const refreshed = await loadSession(selected._id);
            setSession(refreshed);
            setError(
              `${failed.length} payment(s) still need a valid OTP. ` +
              (failed[0]?.reason ? `${failed[0].reason} ` : '') +
              'Correct the code and confirm again.'
            );
            setStep(8);
            setBusy(false);
            return;
          }

          const refreshed = await loadSession(selected._id);
          setSession(refreshed);
          setSuccess(response.data.message);
        }
        setStep(9);
      } catch (e) {
        setError(apiError(e, 'Failed to confirm the TeleBirr payment'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 9) {
      setBusy(true);
      try {
        if (selected?.status !== 'paid') {
          const response = await api.post(`/finance/batches/${selected._id}/paid`);
          await refreshSelected(selected._id);
          setSuccess(response.data.message);

          if (response.data.partial) {
            setMode('');
            setSelectedRequestId('');
            setSession(null);
            setOtpByTransaction({});
            setConfirmation(null);
            setStep(4);
            setError(
              `${response.data.pendingCount} student(s) are still awaiting payment. ` +
              'Select the next student (or batch payment) to continue.'
            );
            setBusy(false);
            return;
          }

          const refreshed = await loadSession(selected._id);
          setSession(refreshed);
        }
        setStep(10);
      } catch (e) {
        setError(apiError(e, 'Failed to change the status to PAID'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 10) {
      resetWorkflow();
    }
  };

  const nextLabel = (() => {
    if (step === 1) return 'Start review →';
    if (step === 2) return busy ? 'Saving…' : 'Confirm info & continue →';
    if (step === 3) return busy ? 'Confirming…' : 'Confirm amount & continue →';
    if (step === 4) return busy ? 'Saving…' : 'Continue to payment method →';
    if (step === 5) return busy ? 'Simulating TeleBirr…' : 'Simulate TeleBirr →';
    if (step === 6) return busy ? 'Generating…' : 'Generate reference & continue →';
    if (step === 7) return busy ? 'Preparing…' : 'Continue to payment confirmation →';
    if (step === 8) return busy ? 'Confirming payment…' : 'Confirm payments & continue →';
    if (step === 9) return busy ? 'Updating status…' : 'Set status to PAID & continue →';
    return 'Start another request';
  })();

  const summary = (() => {
    const requests = selected?.requests || [];
    return {
      students: requests.length,
      amount: selected?.financeConfirmedAmount || selected?.authorizedAmount || selected?.totalAmount || 0,
      mode: paymentModeLabel(mode || selected?.financePaymentMode),
      reference: selected?.financeReference || session?.reference || '',
    };
  })();

  const pendingCount = batches.length;
  const workflowPercent = Math.round((step / 10) * 100);
  const displayName = user?.fullName || 'Officer';

  return (
    <FinancePortal>
      <DashboardPage theme="finance">
        <div className="vp-flow">
          <DashboardHero
            badge={`📅 ${TODAY_LABEL}`}
            title={`Welcome back, ${displayName}`}
            description="Process Administrative VP approved payments through TeleBirr: review the information, confirm the amount, simulate the payment, generate a reference, confirm the OTP, set the request to PAID, and keep the report history."
            actions={[
              { to: '/finance/approved', label: 'Open approved requests', icon: '📥', variant: 'light' },
              { to: '/finance/history', label: 'Payment history', icon: '🕘' },
              { to: '/finance/reports', label: 'Reports', icon: '📊' },
            ]}
            snapshot={(
              <DashboardSnapshot
                label="Current payment"
                value={selected?.batchName || 'Select a request'}
                meta={[
                  `Step ${step} of 10`,
                  `${pendingCount} approved batch${pendingCount === 1 ? '' : 'es'}`,
                  selected ? `${money(summary.amount)} ETB` : 'No batch selected',
                  'Admin VP → Finance → Student · PAID',
                ]}
                progress={workflowPercent}
                progressLabel="Payment workflow progress"
                foot={[
                  { label: 'step', value: `${step}/10` },
                  { label: 'batches', value: pendingCount },
                  { label: 'mode', value: summary.mode },
                ]}
              />
            )}
          />

          {(overview.batches || []).length > 0 && (
            <section className="finance-batch-board" aria-label="Paid and pending students by batch">
              <div className="finance-batch-board-head">
                <div>
                  <h2>Payment position by batch</h2>
                  <p>
                    Each batch has a clear border. Paid students and students still waiting
                    for TeleBirr payment are listed separately inside the batch.
                  </p>
                </div>
                <div className="finance-board-chips">
                  <span className="chip">{overview.pendingBatches || 0} pending batches</span>
                  <span className="chip">{overview.paidBatches || 0} paid batches</span>
                </div>
              </div>

              <div className="finance-batch-grid">
                {(overview.batches || []).map((batch) => (
                  <article
                    key={batch._id}
                    className={`finance-batch-card ${batch.status === 'paid' ? 'is-paid' : 'is-pending'}`}
                  >
                    <header className="finance-batch-card-head">
                      <div>
                        <h3>{batch.batchName}</h3>
                        <p>
                          {batch.batchCode || 'No batch code'} · {batch.semester} · {batch.academicYear}
                        </p>
                      </div>
                      <StatusBadge status={batch.status} />
                    </header>

                    <div className="finance-batch-metrics">
                      <span><b>{batch.paidCount || 0}</b> paid</span>
                      <span><b>{batch.pendingCount || 0}</b> pending</span>
                      <span><b>{money(batch.paidAmount || 0)}</b> ETB paid</span>
                    </div>

                    <div className="finance-student-groups">
                      <div className="finance-student-group paid">
                        <h4>💰 Paid students</h4>
                        {(batch.paidRequests || []).length === 0 ? (
                          <p className="muted">No student has been paid in this batch yet.</p>
                        ) : (
                          <ul>
                            {(batch.paidRequests || []).map((request) => (
                              <li key={request._id}>
                                <div>
                                  <strong>{request.student?.fullName || 'Unknown student'}</strong>
                                  <small>
                                    {request.student?.institutionalId || '—'} · 📞 {request.student?.phone || '—'}
                                  </small>
                                </div>
                                <span className="ok-chip">{money(request.amount)} ETB</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="finance-student-group pending">
                        <h4>⏳ Pending students</h4>
                        {(batch.pendingRequests || []).length === 0 ? (
                          <p className="muted">No student is waiting for payment in this batch.</p>
                        ) : (
                          <ul>
                            {(batch.pendingRequests || []).map((request) => (
                              <li key={request._id}>
                                <div>
                                  <strong>{request.student?.fullName || 'Unknown student'}</strong>
                                  <small>
                                    {request.student?.institutionalId || '—'} · 📞 {request.student?.phone || '—'}
                                  </small>
                                </div>
                                <span className="cs-chip muted">{money(request.amount)} ETB</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <FinanceStepper current={step} />

        {error && <p className="error vp-alert">{error}</p>}
        {success && <p className="notice-ok vp-alert">✅ {success}</p>}

        <section className="vp-panel" aria-live="polite">
          {preparing && <p className="muted">Preparing the payment workflow…</p>}

          {!preparing && step === 1 && (
            <Step1Approved
              batches={batches}
              loading={loading}
              error={listError}
              selectedId={selected?._id}
              onSelect={selectBatch}
              onRefresh={loadBatches}
            />
          )}

          {!preparing && step === 2 && selected && (
            <Step2Review
              batch={selected}
              confirmed={reviewConfirmed}
              onConfirmed={setReviewConfirmed}
            />
          )}

          {!preparing && step === 3 && selected && (
            <Step3Amount
              batchId={selected._id}
              confirmed={amountConfirmed}
              onConfirmed={setAmountConfirmed}
              onCalculated={setAmountData}
              confirmedAt={selected.financeAmountConfirmedAt}
            />
          )}

          {!preparing && step === 4 && selected && (
            <Step4Individual
              batch={selected}
              mode={mode}
              selectedRequestId={selectedRequestId}
              onMode={setMode}
              onSelectRequest={setSelectedRequestId}
            />
          )}

          {!preparing && step === 5 && selected && (
            <Step5Batch
              batch={selected}
              mode={mode}
              selectedRequestId={selectedRequestId}
              onMode={setMode}
              onSelectRequest={setSelectedRequestId}
            />
          )}

          {!preparing && step === 6 && selected && (
            <Step6Simulate batch={selected} session={session} />
          )}

          {!preparing && step === 7 && selected && (
            <Step7Reference batch={selected} session={session} />
          )}

          {!preparing && step === 8 && selected && (
            <Step8Confirm
              batch={selected}
              session={session}
              otpByTransaction={otpByTransaction}
              onOtpChange={(transactionId, value) =>
                setOtpByTransaction((previous) => ({ ...previous, [transactionId]: value }))
              }
            />
          )}

          {!preparing && step === 9 && selected && (
            <Step9Paid batch={selected} confirmation={confirmation} session={session} />
          )}

          {!preparing && step === 10 && selected && (
            <Step10Reports
              batchId={selected._id}
              batch={selected}
              onGenerateReport={mergeSelected}
            />
          )}
        </section>

        <div className="vp-summary-grid">
          <div className="vp-summary"><span>Students</span><b>{summary.students}</b></div>
          <div className="vp-summary"><span>Amount</span><b>{money(summary.amount)} ETB</b></div>
          <div className="vp-summary"><span>Mode</span><b>{summary.mode}</b></div>
          <div className="vp-summary"><span>Reference</span><b>{summary.reference || '—'}</b></div>
          <div className="vp-summary">
            <span>Batch status</span>
            <b>{selected?.status ? selected.status.replaceAll('_', ' ').toUpperCase() : '—'}</b>
          </div>
        </div>

        <nav className="vp-nav" aria-label="Finance workflow navigation">
          <button
            type="button"
            className="btn secondary"
            onClick={back}
            disabled={step === 1 || busy || preparing}
          >
            ← Back
          </button>

          <span className="vp-nav-position">Step {step} of 10</span>

          <button
            type="button"
            className="btn primary"
            onClick={next}
            disabled={busy || preparing}
          >
            {nextLabel}
          </button>
        </nav>
        </div>
      </DashboardPage>
    </FinancePortal>
  );
}
