/**
 * ==========================================================================
 * CivicFix — Admin Login Controller (admin-login.js)
 * ==========================================================================
 * Handles administrator authentication for the CivicFix dashboard.
 *
 * Security & Implementation Details:
 * - Communicates with POST http://localhost:3000/api/admin/login
 * - Performs pre-flight verification on existing sessions via GET /api/admin/verify
 * - Strictly stores JWT in sessionStorage (never localStorage or URLs)
 * - Sanitizes user input and handles rate limits (HTTP 429) gracefully
 * - No sensitive data or tokens are printed to console logs
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Constants & Configuration
  // --------------------------------------------------------------------------
  const LOGIN_API = 'http://localhost:3000/api/admin/login';
  const VERIFY_API = 'http://localhost:3000/api/admin/verify';
  const TOKEN_KEY = 'civicfix_admin_token';
  const USER_KEY = 'civicfix_admin_user';

  // --------------------------------------------------------------------------
  // 2. DOM Elements
  // --------------------------------------------------------------------------
  const loginForm = document.getElementById('admin-login-form');
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  const submitBtn = document.getElementById('login-submit-btn');
  const btnSpinner = document.getElementById('login-btn-spinner');
  const btnText = document.getElementById('login-btn-text');

  const errorBanner = document.getElementById('login-error-banner');
  const errorText = document.getElementById('login-error-text');
  const infoBanner = document.getElementById('login-info-banner');
  const infoText = document.getElementById('login-info-text');

  const usernameError = document.getElementById('username-error');
  const passwordError = document.getElementById('password-error');

  // --------------------------------------------------------------------------
  // 3. Helper Functions: Error and Banner Handling
  // --------------------------------------------------------------------------

  function showErrorMessage(message) {
    if (errorBanner && errorText) {
      errorText.textContent = message;
      errorBanner.classList.add('visible');
    }
  }

  function hideErrorMessage() {
    if (errorBanner) {
      errorBanner.classList.remove('visible');
    }
  }

  function showInfoMessage(message) {
    if (infoBanner && infoText) {
      infoText.textContent = message;
      infoBanner.classList.add('visible');
    }
  }

  function hideInfoMessage() {
    if (infoBanner) {
      infoBanner.classList.remove('visible');
    }
  }

  function clearFieldErrors() {
    if (usernameInput) usernameInput.classList.remove('input-error');
    if (passwordInput) passwordInput.classList.remove('input-error');
    if (usernameError) usernameError.classList.remove('visible');
    if (passwordError) passwordError.classList.remove('visible');
  }

  function setLoading(isLoading) {
    if (!submitBtn) return;

    submitBtn.disabled = isLoading;
    if (usernameInput) usernameInput.disabled = isLoading;
    if (passwordInput) passwordInput.disabled = isLoading;

    if (isLoading) {
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Verifying credentials...';
    } else {
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Sign In to Admin Portal';
    }
  }

  // Clear errors when the user types
  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      usernameInput.classList.remove('input-error');
      if (usernameError) usernameError.classList.remove('visible');
      hideErrorMessage();
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      passwordInput.classList.remove('input-error');
      if (passwordError) passwordError.classList.remove('visible');
      hideErrorMessage();
    });
  }

  // --------------------------------------------------------------------------
  // 4. Initial Checks: URL Parameters & Existing Session
  // --------------------------------------------------------------------------

  // Check URL parameters for status messages (e.g. redirected from expired session)
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');

  if (reason === 'expired') {
    showInfoMessage('Your administrative session has expired. Please sign in again.');
  } else if (reason === 'unauthorized') {
    showInfoMessage('Administrator authentication required to access the dashboard.');
  } else if (reason === 'logout') {
    showInfoMessage('You have logged out successfully.');
  }

  // Clean query string from browser URL so it doesn't persist on reload
  if (reason) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // If a session token already exists in sessionStorage, verify it
  const existingToken = sessionStorage.getItem(TOKEN_KEY);
  if (existingToken && !reason) {
    setLoading(true);
    if (btnText) btnText.textContent = 'Checking existing session...';

    fetch(VERIFY_API, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${existingToken}`
      }
    })
      .then(res => {
        if (res.ok) {
          // Token is still valid; redirect directly to admin dashboard
          window.location.replace('admin.html');
        } else {
          // Invalid or expired token; remove it and let user log in
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(USER_KEY);
          setLoading(false);
        }
      })
      .catch(() => {
        // Network or server error; keep login active
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        setLoading(false);
      });
  }

  // --------------------------------------------------------------------------
  // 5. Handle Form Submission
  // --------------------------------------------------------------------------
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      hideErrorMessage();
      hideInfoMessage();
      clearFieldErrors();

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      // Client-side validation
      let hasError = false;

      if (!username) {
        if (usernameInput) usernameInput.classList.add('input-error');
        if (usernameError) {
          usernameError.textContent = 'Please enter your administrator username.';
          usernameError.classList.add('visible');
        }
        hasError = true;
      }

      if (!password) {
        if (passwordInput) passwordInput.classList.add('input-error');
        if (passwordError) {
          passwordError.textContent = 'Please enter your administrator password.';
          passwordError.classList.add('visible');
        }
        hasError = true;
      }

      if (hasError) {
        if (!username && usernameInput) {
          usernameInput.focus();
        } else if (!password && passwordInput) {
          passwordInput.focus();
        }
        return;
      }

      // Engage loading state
      setLoading(true);

      try {
        const response = await fetch(LOGIN_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username,
            password
          })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success && data.token) {
          // Authentication successful: store token strictly in sessionStorage
          sessionStorage.setItem(TOKEN_KEY, data.token);
          sessionStorage.setItem(USER_KEY, username);

          // Redirect to the protected Admin Dashboard
          window.location.replace('admin.html');
          return;
        }

        // Handle specific HTTP error responses
        if (response.status === 401) {
          showErrorMessage('Invalid credentials. Please verify your username and password.');
        } else if (response.status === 429) {
          showErrorMessage(data.message || 'Too many login attempts. Please wait 15 minutes before trying again.');
        } else if (response.status === 503) {
          showErrorMessage('Administrator authentication is currently disabled on the server.');
        } else if (data.message) {
          showErrorMessage(data.message);
        } else {
          showErrorMessage('Authentication failed. Please verify your credentials and try again.');
        }

        // Reset password field on failure
        if (passwordInput) {
          passwordInput.value = '';
          passwordInput.focus();
        }

      } catch (err) {
        console.error('CivicFix Admin: Login request network error:', err.message);
        showErrorMessage('Unable to connect to the authentication server. Please ensure the backend is running on port 3000.');
      } finally {
        setLoading(false);
      }
    });
  }
});
