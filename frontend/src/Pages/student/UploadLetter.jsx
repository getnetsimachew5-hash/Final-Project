import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { fileUrl } from '../../api/axios';
import StudentPortal from './StudentPortal';

/* Rules kept in sync with the server (backend/src/middleware/upload.js). */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const OK_EXT  = ['.pdf', '.jpg', '.jpeg', '.png'];
const OK_MIME = [
  'application/pdf', 'application/x-pdf',
  'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png',
];

const fmtSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function UploadLetter() {
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [letter, setLetter] = useState(null);
  const [ret, setRet] = useState(null);      // the student's internship return form
  const [reopen, setReopen] = useState({});  // CS-granted post-paid update window
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const inputRef = useRef(null);

  /* Ask the server what the student may do, so the page never disagrees with
     the API (e.g. a letter that has already been verified and is locked). */
  const load = () => {
    setLoading(true);
    return api.get('/student/status')
      .then(r => {
        setRet(r.data.return || null);
        setLetter(r.data.letter || null);
        setReopen(r.data.reopenPermission || {});
        setLoadError('');
      })
      .catch(err => {
        const s = err.response?.status;
        setLoadError(
          s === 401 ? 'Your session has expired. Please log in again.'
          : s === 429 ? 'Too many requests — please wait a minute, then press “Refresh”.'
          : !err.response ? 'Cannot reach the server. Is the backend running?'
          : 'Could not load your submission status.',
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const verified = Boolean(letter?.isVerified);
  const hasLetter = Boolean(letter);
  const noReturn = !ret && !loading && !loadError;

  // A verified letter is locked unless the submission was returned for
  // correction or the CS Department opened a controlled post-paid update
  // window for this student.
  const returnedForCorrection = ret?.status === 'rejected';
  const canPick = !loading && !loadError && (
    !verified || reopen.allowed || returnedForCorrection
  );

  /* ---- file selection ------------------------------------------------- */
  const pick = (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFile(null);
      setMsg(`⚠️ "${f.name}" is ${fmtSize(f.size)}. Maximum size is 10 MB.`);
      return;
    }
    const name = (f.name || '').toLowerCase();
    const okExt  = OK_EXT.some(ext => name.endsWith(ext));
    const okMime = OK_MIME.includes((f.type || '').toLowerCase());
    if (!okExt && !okMime) {
      setFile(null);
      setMsg('⚠️ Only PDF, JPG or PNG files are allowed. Please choose that type of file.');
      return;
    }
    setFile(f);
    setMsg('');
  };

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (!canPick) return;
    if (e.dataTransfer.files?.[0]) pick(e.dataTransfer.files[0]);
  };

  /* ---- upload --------------------------------------------------------- */
  const upload = async (e) => {
    e.preventDefault();

    if (!file)     return setMsg('⚠️ Please choose a file first.');
    if (loading)   return setMsg('⏳ Still checking your submission status — please try again in a second.');
    if (loadError) return setMsg('⚠️ ' + loadError);

    // Explain the blocker in plain words, with the notice above to fix it.
    if (noReturn) {
      return setMsg('⚠️ Submit your Internship Return Form first — the letter can then be uploaded here.');
    }
    if (verified && !reopen.allowed && !returnedForCorrection) {
      return setMsg('⚠️ Your completion letter is already verified and can no longer be replaced after payment.');
    }

    setBusy(true);
    setMsg('');
    const fd = new FormData();
    fd.append('file', file, file.name);

    try {
      await api.post('/student/letter', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMsg('✅ Completion letter uploaded successfully. Awaiting CS Department verification.');
      clearFile();
    } catch (err) {
      const s = err.response?.status;
      setMsg('⚠️ ' + (
        err.response?.data?.message ||
        (s === 401 ? 'Your session has expired. Please log in again.'
         : s === 409 ? 'This letter has already been verified and cannot be replaced.'
         : s === 429 ? 'Too many requests. Please wait a minute and try again.'
         : !err.response ? 'Upload failed — the server could not be reached. Please try again.'
         : 'Upload failed. Please try again.')
      ));
    } finally {
      setBusy(false);
      // Re-read the truth from the server (a 409 means the letter is now locked,
      // a success means a letter now exists) so the page updates honestly.
      await load();
    }
  };

  const ok = msg.startsWith('✅');

  /* Short, friendly hint beside the button — never a silent dead end. */
  let hint = '';
  if (!busy && !file) hint = 'Choose a PDF, JPG or PNG file above to continue.';
  else if (file && noReturn) hint = 'Return form still needed — see the notice above.';
  else if (file && verified && !reopen.allowed && !returnedForCorrection) {
    hint = 'Locked — your letter is already verified.';
  }

  return (
    <StudentPortal>
      <h1>Completion Letter Upload</h1>
      <p className="stu-panel-sub">
        Upload the official completion letter from your internship organization.
        This document is required before the CS Department can verify you.
      </p>

      {loading && <p className="stu-panel-sub">Checking your submission status…</p>}

      {!loading && loadError && (
        <div className="stu-status warn">
          <span>⚠️ {loadError}</span>
          <button type="button" className="btn small" onClick={load}>Refresh</button>
        </div>
      )}

      {/* No return form yet — explain it and lead the student straight there. */}
      {noReturn && (
        <div className="stu-status warn">
          <span>
            📝 Step 1: submit your <b>Internship Return Form</b> — then come back and
            upload the completion letter.
          </span>
          <Link className="btn small primary" to="/student/return">Go to Return Form →</Link>
        </div>
      )}

      {/* CS-granted post-paid update window: the verified letter may be replaced. */}
      {reopen.allowed && (
        <div className="reopen-note">
          <strong>🔓 Update window open.</strong> You may replace your completion letter as part
          of the correction requested by the CS Department.
          {reopen.reason && <> Reason: <b>{reopen.reason}</b>.</>}
        </div>
      )}

      {/* Letter already verified — locked by design unless CS reopened it. */}
      {verified && !reopen.allowed && (
        <div className="stu-status ok">
          <span>✅ Your completion letter has been verified and can no longer be replaced.</span>
          {letter?.filePath && (
            <a className="btn small" href={fileUrl(letter.filePath)} target="_blank" rel="noreferrer">
              📄 View my letter
            </a>
          )}
        </div>
      )}

      {/* Letter uploaded but not verified yet — replacing is allowed. */}
      {hasLetter && !verified && (
        <div className="stu-status info">
          <span>📎 A completion letter is already uploaded and is <b>awaiting verification</b>. You may replace it below.</span>
          {letter.filePath && (
            <a className="btn small" href={fileUrl(letter.filePath)} target="_blank" rel="noreferrer">
              📄 View current letter
            </a>
          )}
        </div>
      )}

      <div className="stu-panel">
        <h2>Upload Document</h2>

        {/* A <label> opens the file picker natively — far more reliable than
            calling .click() on a hidden input, on every browser. */}
        <label
          className={`stu-drop ${drag ? 'drag' : ''} ${canPick ? '' : 'disabled'}`}
          htmlFor="stu-letter-file"
          onDragOver={(e) => { e.preventDefault(); if (canPick) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          aria-disabled={!canPick}
        >
          <span className="drop-ico">☁️</span>
          <p className="drop-title">Click to browse or drag &amp; drop your file here</p>
          <p className="drop-hint">Accepted formats: PDF, JPG, PNG · Maximum size 10 MB</p>
          <input
            id="stu-letter-file"
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={e => pick(e.target.files?.[0])}
            disabled={!canPick}
          />
        </label>

        {file && (
          <div className="stu-file">
            <span className="stu-file-name">📄 {file.name}</span>
            <span className="stu-file-size">{fmtSize(file.size)}</span>
            <button
              type="button"
              className="stu-file-x"
              onClick={clearFile}
              aria-label="Remove selected file"
              title="Remove selected file"
            >
              ✕
            </button>
          </div>
        )}

        <div className="stu-form-foot stu-upload-foot">
          <button
            className="btn primary"
            onClick={upload}
            disabled={busy || !file}
          >
            {busy ? 'Uploading…' : hasLetter ? '⬆️ Replace Letter' : '⬆️ Upload Letter'}
          </button>
          {hint && <span className="stu-helper">{hint}</span>}
        </div>

        {msg && (
          <p className={ok ? 'success' : 'error'} role="status" aria-live="polite">{msg}</p>
        )}
      </div>
    </StudentPortal>
  );
}
