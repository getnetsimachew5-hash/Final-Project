import React from 'react';

const MAIN_TITLE = 'WELCOME TO WACHEMO UNIVERSITY';
const SUB_TITLE  = 'PAYMENT SYSTEM';

/**
 * Modern Animated Hero Title Component
 * Features:
 * - Staggered letter pop-in for "WELCOME"
 * - Word rise-in with subtle blur dynamics for "TO WACHEMO UNIVERSITY"
 * - Shimmering multi-color gradient glow for "PAYMENT SYSTEM"
 * - Animated expanding accent bar
 */
export default function WelcomeTitle() {
  const fullHeading = `${MAIN_TITLE} ${SUB_TITLE}`;

  return (
    <div className="welcome-title-wrapper" role="banner">
      <div className="welcome-badge-tag">
        <span className="live-dot" /> WACHEMO UNIVERSITY SIPMS OFFICIAL PORTAL
      </div>
      
      <h1 className="welcome-main" aria-label={fullHeading}>
        {MAIN_TITLE.split(' ').map((word, wi) => (
          <span
            key={wi}
            className="w"
            style={{ animationDelay: `${0.12 + wi * 0.18}s` }}
            aria-hidden="true"
          >
            {wi === 0
              ? word.split('').map((ch, ci) => (
                  <span key={ci} className="ch" style={{ animationDelay: `${ci * 0.06}s` }}>
                    {ch}
                  </span>
                ))
              : word}
            {' '}
          </span>
        ))}
      </h1>

      <div className="welcome-sub" aria-hidden="true">
        <span className="shine-gradient">{SUB_TITLE}</span>
      </div>

      <div className="welcome-accent-bar" aria-hidden="true">
        <span className="accent-glow" />
      </div>
    </div>
  );
}
