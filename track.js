/**
 *==========================================================================
 *CivicFix — Public Complaint Tracking (track.js)
 *==========================================================================
 *Allows citizens to check real-time resolution progress of their complaints
 *using a unique, cryptographically secure tracking token.
 *
 *Features & Privacy:
 *- Queries GET http://localhost:3000/api/issues/track/:token
 *- Protects citizen confidentiality: returns strictly status and submission date
 *- Visual three-step timeline stepper: Submitted -> In Progress -> Resolved
 *- Pre-populates token and auto-tracks if ?token=... is present in URL
 *- Graceful error handling (404 Not Found, 429 Rate Limited, 400 Invalid)
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Constants & Configuration
  // --------------------------------------------------------------------------
  const TRACK_API = 'http://localhost:3000/api/issues/track';

  const STATUS_CONFIG = {
    pending: {
      label: 'Submitted',
      className: 'status-submitted',
      stepIndex: 1
    },
    approved: {
      label: 'In Progress',
      className: 'status-progress',
      stepIndex: 2
    },
    done: {
      label: 'Resolved',
      className: 'status-resolved',
      stepIndex: 3
    }
  };

  // --------------------------------------------------------------------------
  // 2. DOM Elements
  // --------------------------------------------------------------------------
  const trackingForm = document.getElementById('tracking-form');
  const tokenInput = document.getElementById('tracking-token-input');
  const tokenError = document.getElementById('token-input-error');
  const submitBtn = document.getElementById('track-submit-btn');
  const btnSpinner = document.getElementById('track-btn-spinner');
  const btnText = document.getElementById('track-btn-text');

  const errorBanner = document.getElementById('track-error-banner');
  const errorText = document.getElementById('track-error-text');

  const resultCard = document.getElementById('tracking-result-card');
  const resultStatusTitle = document.getElementById('result-status-title');
  const resultStatusBadge = document.getElementById('result-status-badge');
  const resultDate = document.getElementById('result-date');
  const resultTokenDisplay = document.getElementById('result-token-display');
  const trackAnotherBtn = document.getElementById('track-another-btn');

  // Stepper Elements
  const stepperLineFill = document.getElementById('stepper-line-fill');
  const stepNodes = [
    document.getElementById('step-node-1'),
    document.getElementById('step-node-2'),
    document.getElementById('step-node-3')
  ];
  const stepCircles = [
    document.getElementById('step-circle-1'),
    document.getElementById('step-circle-2'),
    document.getElementById('step-circle-3')
  ];

  // --------------------------------------------------------------------------
  // 3. UI Helpers
  // --------------------------------------------------------------------------

  function showError(message) {
    if (errorBanner && errorText) {
      errorText.textContent = message;
      errorBanner.classList.add('visible');
    }
    if (resultCard) {
      resultCard.style.display = 'none';
    }
  }

  function hideError() {
    if (errorBanner) {
      errorBanner.classList.remove('visible');
    }
    if (tokenInput) {
      tokenInput.classList.remove('input-error');
    }
    if (tokenError) {
      tokenError.classList.remove('visible');
    }
  }

  function setLoading(isLoading) {
    if (!submitBtn) return;

    submitBtn.disabled = isLoading;
    if (tokenInput) tokenInput.disabled = isLoading;

    if (isLoading) {
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Checking Status...';
    } else {
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Check Complaint Status';
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Updates the three-step progress indicator based on current complaint status.
   * @param {string} status - 'pending' | 'approved' | 'done'
   */
  function updateStepper(status) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const activeStep = config.stepIndex; // 1, 2, or 3

    // Update status badge & header title
    if (resultStatusTitle) resultStatusTitle.textContent = config.label;
    if (resultStatusBadge) {
      resultStatusBadge.className = `admin-status-badge ${config.className}`;
      resultStatusBadge.textContent = config.label;
    }

    // Reset each step node
    stepNodes.forEach((node, index) => {
      const stepNumber = index + 1;
      const circle = stepCircles[index];

      node.classList.remove('is-completed', 'is-active', 'is-pending');

      if (stepNumber < activeStep) {
        // Step completed
        node.classList.add('is-completed');
        if (circle) circle.textContent = '✓';
      } else if (stepNumber === activeStep) {
        // Current active step
        if (status === 'done') {
          // If status is done, step 3 is also completed with checkmark
          node.classList.add('is-completed');
          if (circle) circle.textContent = '✓';
        } else {
          node.classList.add('is-active');
          if (circle) circle.textContent = String(stepNumber);
        }
      } else {
        // Upcoming pending step
        node.classList.add('is-pending');
        if (circle) circle.textContent = String(stepNumber);
      }
    });

    // Update connecting progress line fill
    if (stepperLineFill) {
      const isMobile = window.innerWidth <= 600;
      if (isMobile) {
        if (activeStep === 1) stepperLineFill.style.height = '0%';
        else if (activeStep === 2) stepperLineFill.style.height = '50%';
        else if (activeStep === 3) stepperLineFill.style.height = '100%';
        stepperLineFill.style.width = '3px';
      } else {
        if (activeStep === 1) stepperLineFill.style.width = '0%';
        else if (activeStep === 2) stepperLineFill.style.width = '50%';
        else if (activeStep === 3) stepperLineFill.style.width = '100%';
        stepperLineFill.style.height = '3px';
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Token Lookup Logic
  // --------------------------------------------------------------------------
  async function performTrackingLookup(token) {
    hideError();

    const cleanToken = token ? token.trim() : '';

    // Client-side format validation
    if (!cleanToken) {
      if (tokenInput) tokenInput.classList.add('input-error');
      if (tokenError) {
        tokenError.textContent = 'Please enter your complaint tracking token.';
        tokenError.classList.add('visible');
      }
      return;
    }

    if (cleanToken.length < 10 || cleanToken.length > 64 || !/^[A-Za-z0-9_-]+$/.test(cleanToken)) {
      if (tokenInput) tokenInput.classList.add('input-error');
      if (tokenError) {
        tokenError.textContent = 'Invalid format. Tokens look like: CF-XXXXXXXXXXXXXXXXXXXXXXXX';
        tokenError.classList.add('visible');
      }
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${TRACK_API}/${encodeURIComponent(cleanToken)}`);
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        // Populate tracking card details
        updateStepper(data.status);

        if (resultDate) {
          resultDate.textContent = formatDate(data.createdAt);
        }

        if (resultTokenDisplay) {
          resultTokenDisplay.textContent = cleanToken.toUpperCase();
        }

        // Reveal result card
        if (resultCard) {
          resultCard.style.display = 'block';
          resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }

      // Handle specific error codes
      if (response.status === 404) {
        showError('No complaint found matching this tracking token. Please verify your token and try again.');
      } else if (response.status === 429) {
        showError(data.message || 'Too many lookup requests. Please wait 15 minutes before trying again.');
      } else if (response.status === 400) {
        showError(data.message || 'Invalid tracking token format.');
      } else {
        showError(data.message || 'Unable to look up complaint status. Please try again.');
      }

    } catch (err) {
      console.error('CivicFix Tracking: Network error:', err.message);
      showError('Unable to connect to CivicFix server. Please ensure the backend is running on port 3000.');
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Event Listeners
  // --------------------------------------------------------------------------

  // Form submit
  if (trackingForm) {
    trackingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredToken = tokenInput ? tokenInput.value : '';
      performTrackingLookup(enteredToken);
    });
  }

  // Clear errors when typing
  if (tokenInput) {
    tokenInput.addEventListener('input', () => {
      hideError();
    });
  }

  // "Check Another Complaint" button resets view
  if (trackAnotherBtn) {
    trackAnotherBtn.addEventListener('click', () => {
      if (resultCard) resultCard.style.display = 'none';
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.focus();
      }
      hideError();
    });
  }

  // Handle window resize for stepper connector line adjustments
  window.addEventListener('resize', () => {
    if (resultCard && resultCard.style.display !== 'none' && resultStatusBadge) {
      const currentBadgeText = resultStatusBadge.textContent.trim().toLowerCase();
      let statusKey = 'pending';
      if (currentBadgeText.includes('progress')) statusKey = 'approved';
      else if (currentBadgeText.includes('resolved')) statusKey = 'done';
      updateStepper(statusKey);
    }
  });

  // --------------------------------------------------------------------------
  // 6. Pre-fill & Auto-lookup from URL Query Parameter
  // --------------------------------------------------------------------------
  const urlParams = new URLSearchParams(window.location.search);
  const initialToken = urlParams.get('token');

  if (initialToken) {
    if (tokenInput) tokenInput.value = initialToken;
    performTrackingLookup(initialToken);
  }
});
