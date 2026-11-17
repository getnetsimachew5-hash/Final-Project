// Ordered list of the ten Finance Office functions.
// Purely presentational: `current` is the step being performed.
const STEPS = [
  { n: 1, label: 'Approved requests', title: 'View approved payment requests' },
  { n: 2, label: 'Review info',       title: 'Review and confirm payment information' },
  { n: 3, label: 'Confirm amount',    title: 'Calculate and confirm payment amount' },
  { n: 4, label: 'Individual',        title: 'Process individual payment' },
  { n: 5, label: 'Batch',             title: 'Process batch payment' },
  { n: 6, label: 'TeleBirr',          title: 'Simulate TeleBirr payment' },
  { n: 7, label: 'Reference',         title: 'Generate payment reference' },
  { n: 8, label: 'Confirm',           title: 'Confirm successful payment' },
  { n: 9, label: 'PAID',              title: 'Change request status to PAID' },
  { n: 10, label: 'Reports',          title: 'Generate payment reports and maintain history' },
];

export default function FinanceStepper({ current }) {
  return (
    <ol className="vp-stepper" aria-label="Finance workflow steps">
      {STEPS.map((step) => {
        const state = step.n < current ? 'done' : step.n === current ? 'active' : 'locked';
        return (
          <li
            key={step.n}
            className={`vp-step ${state}`}
            aria-current={step.n === current ? 'step' : undefined}
            title={step.title}
          >
            <span className="vp-step-num" aria-hidden="true">{state === 'done' ? '✓' : step.n}</span>
            <span className="vp-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
