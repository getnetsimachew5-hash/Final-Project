import { useCallback, useEffect, useState } from 'react';
import api from '../../../api/axios';
import {
  apiError,
  money,
  shortDate,
} from './helpers';

// FUNCTION 3 — Calculate & confirm payment amount.
// The server recalculates dailyRate × internship days and compares it with the
// amount snapshotted on the payment request. The officer confirms the total.
export default function Step3Amount({ batchId, confirmed, onConfirmed, onCalculated, confirmedAt }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/finance/batches/${batchId}/amount`);
      setData(response.data);
      onCalculated?.(response.data);
    } catch (e) {
      setError(apiError(e, 'Failed to calculate the payment amounts'));
    } finally {
      setLoading(false);
    }
  }, [batchId, onCalculated]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;

  return (
    <>
      <div className="vp-panel-head">
        <h2>3. Calculate &amp; confirm payment amount</h2>
        <p className="muted">
          Each student is paid <b>daily rate × internship days</b>. The request snapshot
          is compared with the internship return form before payment.
        </p>
      </div>

      {confirmedAt && (
        <p className="vp-status-note">
          The amount was already confirmed on {new Date(confirmedAt).toLocaleString()}.
        </p>
      )}

      <div className="batch-actions">
        <button className="btn secondary" type="button" onClick={load} disabled={loading}>
          {loading ? 'Calculating…' : 'Recalculate'}
        </button>
      </div>

      {loading && <p className="muted">Calculating payment amounts…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && data && (
        <>
          <div className="vp-summary-grid">
            <div className="vp-summary"><span>Students</span><b>{summary.studentCount}</b></div>
            <div className="vp-summary"><span>Request total</span><b>{money(summary.totalAmount)} ETB</b></div>
            <div className="vp-summary"><span>Recalculated</span><b>{money(summary.recalculatedTotal)} ETB</b></div>
            <div className="vp-summary">
              <span>Differences</span>
              <b className={summary.mismatchCount ? 'error' : ''}>{summary.mismatchCount}</b>
            </div>
          </div>

          {summary.mismatchCount > 0 && (
            <p className="error">
              {summary.mismatchCount} student amount(s) do not match the internship period.
              The request snapshot remains the authorized amount; check the highlighted rows
              before confirming.
            </p>
          )}

          {summary.missingPhoneCount > 0 && (
            <p className="error">
              {summary.missingPhoneCount} student(s) have no TeleBirr phone number. They cannot
              be paid until the student record is fixed.
            </p>
          )}

          <div className="vp-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Rate</th>
                  <th>Days</th>
                  <th>Calculated</th>
                  <th>Request amount</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((item) => (
                  <tr key={item.requestId}>
                    <td>
                      {item.studentName}<br />
                      <small className="muted">{item.institutionalId || '—'} · {item.orgName || '—'}</small>
                      <br />
                      <small className="muted">
                        {shortDate(item.startDate)} → {shortDate(item.endDate)}
                      </small>
                    </td>
                    <td>{money(item.dailyRate)} ETB/day</td>
                    <td>{item.calculationDays}</td>
                    <td>{money(item.recalculatedAmount)} ETB</td>
                    <td><b>{money(item.storedAmount)} ETB</b></td>
                    <td>
                      {item.matched
                        ? <span className="badge green">Matches</span>
                        : <span className="badge yellow">Review</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="vp-ack">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirmed(event.target.checked)}
            />
            <span>
              I confirm the total payment amount of <b>{money(summary.totalAmount)} ETB</b>{' '}
              for {summary.studentCount} student(s). This is the amount authorized by the Admin VP.
            </span>
          </label>
        </>
      )}
    </>
  );
}
