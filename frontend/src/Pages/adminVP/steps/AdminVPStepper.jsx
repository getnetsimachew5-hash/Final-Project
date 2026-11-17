// Ordered list of the seven Administrative VP functions.
// Purely presentational: `current` is the step being performed.
const STEPS = [
  { n: 1, label: 'View endorsed',    title: 'View academically endorsed requests' },
  { n: 2, label: 'Review',           title: 'Review administrative requirements' },
  { n: 3, label: 'Confirm payment',  title: 'Confirm payment availability/authorization' },
  { n: 4, label: 'Decide',           title: 'Approve or reject request' },
  { n: 5, label: 'Comment',          title: 'Add comments' },
  { n: 6, label: 'Forward',          title: 'Forward approved request directly to Finance' },
  { n: 7, label: 'History',          title: 'View approval history' },
];

export default function AdminVPStepper({ current }) {
  return (
    <ol className="vp-stepper" aria-label="Administrative VP workflow steps">
      {STEPS.map((s) => {
        const state = s.n < current ? 'done' : s.n === current ? 'active' : 'locked';
        return (
          <li
            key={s.n}
            className={`vp-step ${state}`}
            aria-current={s.n === current ? 'step' : undefined}
            title={s.title}
          >
            <span className="vp-step-num" aria-hidden="true">{state === 'done' ? '✓' : s.n}</span>
            <span className="vp-step-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
