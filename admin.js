/**
 * ==========================================================================
 * CivicFix — Admin Dashboard (admin.js)
 * ==========================================================================
 * Connects the admin.html dashboard to the existing MongoDB-backed Express API:
 *   GET   http://localhost:3000/api/issues
 *   PATCH http://localhost:3000/api/issues/:id
 *
 * Features & Security:
 * - Session verification via GET http://localhost:3000/api/admin/verify
 * - Redirects unauthenticated users and expired sessions to admin-login.html
 * - Admin logout handling that clears sessionStorage and redirects to login
 * - Real-time status update control (Submitted, In Progress, Resolved)
 * - Safe DOM table rendering with textContent to prevent injection
 * - Live update of status badges and summary statistics upon successful update
 * - Clear error feedback with automatic rollback on failed updates
 * - Image fallback for missing or broken photo URLs
 * - Sensitive tokens stored exclusively in sessionStorage
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --------------------------------------------------------------------------
  // 1. Configuration & Constants
  // --------------------------------------------------------------------------
  const ISSUES_API = 'http://localhost:3000/api/issues';
  const VERIFY_API = 'http://localhost:3000/api/admin/verify';
  const TOKEN_KEY = 'civicfix_admin_token';
  const USER_KEY = 'civicfix_admin_user';

  // Map backend statuses (pending, approved, done) to user-facing labels and badge styles
  const STATUS_CONFIG = {
    pending: {
      label: 'Submitted',
      className: 'status-submitted'
    },
    approved: {
      label: 'In Progress',
      className: 'status-progress'
    },
    done: {
      label: 'Resolved',
      className: 'status-resolved'
    }
  };

  // Map backend category keys to friendly user-facing labels with icons
  const CATEGORY_LABELS = {
    pothole: '🚧 Potholes & Roads',
    streetlight: '💡 Streetlights',
    garbage: '🗑️ Garbage & Sanitation',
    water_leak: '💧 Water Supply',
    drainage: '🚰 Drainage / Manhole',
    other: '⚠️ Public Hazard'
  };

  // SVG placeholder data URI for issues without a photo or with broken images
  const FALLBACK_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%20viewBox%3D%220%200%20600%20400%22%20fill%3D%22%23e2e8f0%22%3E%3Crect%20width%3D%22600%22%20height%3D%22400%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Cpath%20d%3D%22M260%20170a30%2030%200%201%200%200-60%2030%2030%200%200%200%200%2060Zm-70%20110h220l-70-90-50%2060-35-45-65%2075Z%22%20fill%3D%22%2394a3b8%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2282%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%2364748b%22%20font-family%3D%22system-ui%2Csans-serif%22%20font-size%3D%2218%22%20font-weight%3D%22500%22%3ENo%20Photo%20Attached%3C%2Ftext%3E%3C%2Fsvg%3E";

  // In-memory cache of complaints for responsive updates
  let issuesCache = [];
  let feedbackTimeout = null;

  // --------------------------------------------------------------------------
  // 2. Authentication Guard & Session Validation
  // --------------------------------------------------------------------------
  const adminAuthLoading = document.getElementById('admin-auth-loading');
  const adminDashboardRoot = document.getElementById('admin-dashboard-root');
  const adminNavAuth = document.getElementById('admin-nav-auth');
  const adminUsernameLabel = document.getElementById('admin-username-label');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');

  const token = sessionStorage.getItem(TOKEN_KEY);

  // If no token exists, immediately redirect to login without flashing content or making requests
  if (!token) {
    window.location.replace('admin-login.html?reason=unauthorized');
    return;
  }

  /**
   * Validates the active session token with the backend verify endpoint.
   * @returns {Promise<boolean>}
   */
  async function verifySession() {
    try {
      const response = await fetch(VERIFY_API, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Expired or invalid token
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        window.location.replace('admin-login.html?reason=expired');
        return false;
      }

      const data = await response.json();

      // Show authenticated admin badge in navbar
      if (data && data.success && data.admin) {
        if (adminUsernameLabel && data.admin.username) {
          adminUsernameLabel.textContent = data.admin.username;
        }
      }

      // Session verified: show dashboard and nav controls, hide verification spinner
      if (adminAuthLoading) adminAuthLoading.style.display = 'none';
      if (adminNavAuth) adminNavAuth.style.display = 'flex';
      if (adminDashboardRoot) adminDashboardRoot.style.display = 'block';

      return true;

    } catch (error) {
      console.error('CivicFix Admin: Session verification failed:', error.message);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      window.location.replace('admin-login.html?reason=unauthorized');
      return false;
    }
  }

  // Execute authentication check before loading dashboard data
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    return;
  }

  // --------------------------------------------------------------------------
  // 3. Logout Handler
  // --------------------------------------------------------------------------
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
      // Clear all administrative session data
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);

      // Redirect to login page with logout confirmation notice
      window.location.replace('admin-login.html?reason=logout');
    });
  }

  // --------------------------------------------------------------------------
  // 4. Dashboard DOM Elements
  // --------------------------------------------------------------------------
  const tableArea = document.getElementById('admin-table-area');
  const countPill = document.getElementById('admin-count-pill');
  const refreshBtn = document.getElementById('admin-refresh-btn');
  const feedbackBanner = document.getElementById('admin-feedback-banner');
  const feedbackText = document.getElementById('admin-feedback-text');

  // Statistics counters
  const statTotal = document.getElementById('admin-stat-total');
  const statPending = document.getElementById('admin-stat-pending');
  const statProgress = document.getElementById('admin-stat-progress');
  const statResolved = document.getElementById('admin-stat-resolved');

  if (!tableArea) {
    console.error('CivicFix Admin: #admin-table-area container not found.');
    return;
  }

  // --------------------------------------------------------------------------
  // 5. Helper Functions & Feedback UI
  // --------------------------------------------------------------------------

  /**
   * Displays clear user feedback banner above the table.
   * @param {string} message
   * @param {'success'|'error'} type
   */
  function showFeedbackBanner(message, type = 'success') {
    if (!feedbackBanner || !feedbackText) return;

    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    feedbackText.textContent = message;
    feedbackBanner.className = `admin-feedback-banner ${type}`;
    feedbackBanner.style.display = 'flex';

    // Auto-dismiss success notifications after 5 seconds
    if (type === 'success') {
      feedbackTimeout = setTimeout(() => {
        feedbackBanner.style.display = 'none';
      }, 5000);
    }
  }

  function hideFeedbackBanner() {
    if (feedbackBanner) {
      feedbackBanner.style.display = 'none';
    }
  }

  /**
   * Formats an ISO date string into a human-friendly relative or calendar string.
   * @param {string} dateString
   * @returns {string}
   */
  function formatDate(dateString) {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * Updates the 4 summary statistics based on complaints array:
   * - Total complaints
   * - pending: Pending / Submitted
   * - approved: In Progress
   * - done: Resolved
   * @param {Array} issues
   */
  function updateAdminStats(issues) {
    if (!Array.isArray(issues)) {
      resetAdminStats();
      return;
    }

    const total = issues.length;
    const pending = issues.filter(i => i.status === 'pending').length;
    const progress = issues.filter(i => i.status === 'approved').length;
    const resolved = issues.filter(i => i.status === 'done').length;

    if (statTotal) statTotal.textContent = total.toLocaleString();
    if (statPending) statPending.textContent = pending.toLocaleString();
    if (statProgress) statProgress.textContent = progress.toLocaleString();
    if (statResolved) statResolved.textContent = resolved.toLocaleString();

    if (countPill) {
      countPill.textContent = `${total} ${total === 1 ? 'Report' : 'Reports'}`;
    }
  }

  /**
   * Resets all statistic counters to neutral placeholder.
   */
  function resetAdminStats() {
    if (statTotal) statTotal.textContent = '-';
    if (statPending) statPending.textContent = '-';
    if (statProgress) statProgress.textContent = '-';
    if (statResolved) statResolved.textContent = '-';
    if (countPill) countPill.textContent = '-';
  }

  /**
   * Handles complaint status changes via the protected PATCH API.
   * @param {Object} issue - The complaint object
   * @param {string} newStatus - The newly selected status ('pending' | 'approved' | 'done')
   * @param {string} previousStatus - The previous status to rollback on error
   * @param {HTMLSelectElement} selectEl - The select element
   * @param {HTMLSpanElement} badgeEl - The status badge element
   */
  async function handleStatusChange(issue, newStatus, previousStatus, selectEl, badgeEl) {
    selectEl.disabled = true;
    hideFeedbackBanner();

    try {
      const response = await fetch(`${ISSUES_API}/${issue._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      // Handle expired or invalid session token
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        window.location.replace('admin-login.html?reason=expired');
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Server returned HTTP ${response.status}`);
      }

      // 1. Permanently update in-memory cache
      issue.status = newStatus;
      const cached = issuesCache.find(i => (i._id === issue._id));
      if (cached) {
        cached.status = newStatus;
      }

      // 2. Update visual badge in the table row
      const statusConfig = STATUS_CONFIG[newStatus] || {
        label: newStatus,
        className: 'status-submitted'
      };
      badgeEl.className = `admin-status-badge ${statusConfig.className}`;
      badgeEl.textContent = statusConfig.label;

      // 3. Update dashboard summary counters immediately
      updateAdminStats(issuesCache);

      // 4. Show positive confirmation message
      const issueTitle = issue.title ? `"${issue.title}"` : 'Complaint';
      showFeedbackBanner(`Status for ${issueTitle} updated to "${statusConfig.label}".`, 'success');

    } catch (error) {
      console.error('CivicFix Admin: Failed to update complaint status:', error.message);

      // Rollback select value to previous state to prevent misleading display
      selectEl.value = previousStatus;

      // Show clear error message
      showFeedbackBanner(`Failed to update status: ${error.message}`, 'error');

    } finally {
      selectEl.disabled = false;
    }
  }

  /**
   * Creates a table row safely using textContent to prevent HTML injection.
   * @param {Object} issue
   * @returns {HTMLTableRowElement}
   */
  function createIssueRow(issue) {
    const tr = document.createElement('tr');

    // 1. Photo Thumbnail Column
    const tdPhoto = document.createElement('td');
    const img = document.createElement('img');
    img.className = 'admin-thumb';
    img.alt = issue.title ? `Photo of ${issue.title}` : 'Issue thumbnail';
    img.loading = 'lazy';
    img.src = issue.photoUrl || FALLBACK_IMAGE;
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_IMAGE;
    };
    tdPhoto.appendChild(img);

    // 2. Title & Description Column
    const tdTitle = document.createElement('td');
    const titleEl = document.createElement('div');
    titleEl.className = 'admin-issue-title';
    titleEl.textContent = issue.title || 'Untitled Issue';

    const descEl = document.createElement('div');
    descEl.className = 'admin-issue-desc';
    descEl.textContent = issue.description || 'No description provided.';

    tdTitle.appendChild(titleEl);
    tdTitle.appendChild(descEl);

    // 3. Category Column
    const tdCategory = document.createElement('td');
    const catSpan = document.createElement('span');
    catSpan.className = 'issue-category-tag';
    catSpan.style.marginBottom = '0';
    catSpan.textContent = CATEGORY_LABELS[issue.category] || issue.category || 'General';
    tdCategory.appendChild(catSpan);

    // 4. Location Column
    const tdLocation = document.createElement('td');
    const locDiv = document.createElement('div');
    locDiv.className = 'issue-location';
    locDiv.style.maxWidth = '190px';
    locDiv.title = issue.location || '';

    locDiv.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `;
    const locSpan = document.createElement('span');
    locSpan.textContent = issue.location || 'Location not specified';
    locDiv.appendChild(locSpan);
    tdLocation.appendChild(locDiv);

    // 5. Date Column
    const tdDate = document.createElement('td');
    const timeEl = document.createElement('time');
    if (issue.createdAt) {
      timeEl.dateTime = issue.createdAt;
      timeEl.textContent = formatDate(issue.createdAt);
    } else {
      timeEl.textContent = 'Recently';
    }
    timeEl.style.color = 'var(--text-muted)';
    timeEl.style.fontSize = '0.85rem';
    tdDate.appendChild(timeEl);

    // 6. Current Status Column
    const tdStatus = document.createElement('td');
    const statusConfig = STATUS_CONFIG[issue.status] || {
      label: issue.status || 'Submitted',
      className: 'status-submitted'
    };
    const badge = document.createElement('span');
    badge.className = `admin-status-badge ${statusConfig.className}`;
    badge.textContent = statusConfig.label;
    tdStatus.appendChild(badge);

    // 7. Update Status Control Column
    const tdAction = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'admin-status-select';
    select.setAttribute('aria-label', `Update status for ${issue.title || 'complaint'}`);

    // Options allowed: Submitted, In Progress, Resolved
    const statusOptions = [
      { value: 'pending', label: 'Submitted' },
      { value: 'approved', label: 'In Progress' },
      { value: 'done', label: 'Resolved' }
    ];

    statusOptions.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (issue.status === opt.value) {
        optionEl.selected = true;
      }
      select.appendChild(optionEl);
    });

    // Handle status change
    select.addEventListener('change', () => {
      const newStatus = select.value;
      const previousStatus = issue.status;

      if (newStatus === previousStatus) return;

      handleStatusChange(issue, newStatus, previousStatus, select, badge);
    });

    tdAction.appendChild(select);

    // Assemble complete row
    tr.appendChild(tdPhoto);
    tr.appendChild(tdTitle);
    tr.appendChild(tdCategory);
    tr.appendChild(tdLocation);
    tr.appendChild(tdDate);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);

    return tr;
  }

  // --------------------------------------------------------------------------
  // 6. State Rendering Functions
  // --------------------------------------------------------------------------

  function renderLoading() {
    tableArea.innerHTML = `
      <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">
          Loading operational complaints...
        </p>
        <p style="font-size: 0.9rem;">Connecting to CivicFix backend API.</p>
      </div>
    `;
  }

  function renderEmpty() {
    tableArea.innerHTML = `
      <div style="text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted);">
        <p style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem;">
          No Complaints Reported Yet
        </p>
        <p style="font-size: 0.95rem; margin-bottom: 1.5rem; max-width: 460px; margin-left: auto; margin-right: auto;">
          There are currently no civic complaints logged in MongoDB Atlas. New citizen submissions will populate here automatically.
        </p>
        <a href="report.html" class="btn btn-primary">
          + File a Test Complaint
        </a>
      </div>
    `;
  }

  function renderError(errorMessage) {
    tableArea.innerHTML = `
      <div style="text-align: center; padding: 3rem 1.5rem; background: #fef2f2; margin: 1rem; border-radius: var(--radius-md); color: #991b1b; border: 1.5px solid #fecaca;">
        <p style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem;">
          Unable to Load Complaints
        </p>
        <p style="font-size: 0.9rem; margin-bottom: 1.25rem; color: #b91c1c;">
          Could not fetch data from ${ISSUES_API}. Ensure your backend server is running on port 3000.
        </p>
        <button type="button" class="btn btn-outline" id="admin-retry-btn" style="background: white;">
          🔄 Try Again
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('admin-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', fetchAdminIssues);
    }
  }

  function renderTable(issues) {
    tableArea.innerHTML = `
      <div class="admin-table-scroll">
        <table class="admin-table" aria-label="Complaints List">
          <thead>
            <tr>
              <th scope="col" style="width: 70px;">Photo</th>
              <th scope="col">Title & Description</th>
              <th scope="col" style="width: 170px;">Category</th>
              <th scope="col" style="width: 190px;">Location</th>
              <th scope="col" style="width: 120px;">Date Reported</th>
              <th scope="col" style="width: 130px;">Status</th>
              <th scope="col" style="width: 150px;">Update Status</th>
            </tr>
          </thead>
          <tbody id="admin-table-body"></tbody>
        </table>
      </div>
    `;

    const tbody = document.getElementById('admin-table-body');
    const fragment = document.createDocumentFragment();

    issues.forEach(issue => {
      const row = createIssueRow(issue);
      fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
  }

  // --------------------------------------------------------------------------
  // 7. Fetch Issues from Backend
  // --------------------------------------------------------------------------
  async function fetchAdminIssues() {
    renderLoading();
    resetAdminStats();
    hideFeedbackBanner();

    try {
      const response = await fetch(ISSUES_API, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        // Expired or unauthorized session
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        window.location.replace('admin-login.html?reason=expired');
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      let issues = [];
      if (result && Array.isArray(result.data)) {
        issues = result.data;
      } else if (Array.isArray(result)) {
        issues = result;
      }

      // Keep cache in memory for live updates
      issuesCache = issues;

      // Update statistics with live data
      updateAdminStats(issuesCache);

      // Render table or empty state
      if (issuesCache.length === 0) {
        renderEmpty();
      } else {
        renderTable(issuesCache);
      }

    } catch (error) {
      console.error('CivicFix Admin: Error fetching issues:', error);
      resetAdminStats();
      renderError(error.message);
    }
  }

  // --------------------------------------------------------------------------
  // 8. Refresh Button Event Listener & Initial Fetch
  // --------------------------------------------------------------------------
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchAdminIssues();
    });
  }

  // Fetch initial complaint data
  fetchAdminIssues();
});
