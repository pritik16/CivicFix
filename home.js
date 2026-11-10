/**
 * ==========================================================================
 * CivicFix — Community Feed (home.js)
 * ==========================================================================
 * Connects the index.html homepage to the MongoDB-backed Express API:
 *   GET http://localhost:3000/api/issues
 * 
 * Features:
 * - Dynamic issue rendering using safe DOM methods (textContent)
 * - Status mapping: pending -> Submitted, approved -> In Progress, done -> Resolved
 * - Graceful loading, empty, and error states
 * - Image fallback for missing or broken photo URLs
 * - Client-side category filtering using existing filter pills
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Configuration & Constants
  // --------------------------------------------------------------------------
  const API_URL = 'http://localhost:3000/api/issues';

  // Map backend statuses (pending, approved, done) to user-facing labels and CSS classes
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
    water_leak: '💧 Water Supply & Leaks',
    drainage: '🚰 Open Drain / Drainage',
    other: '⚠️ Public Hazard'
  };

  // SVG placeholder data URI for issues without a photo or with broken images
  const FALLBACK_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22400%22%20viewBox%3D%220%200%20600%20400%22%20fill%3D%22%23e2e8f0%22%3E%3Crect%20width%3D%22600%22%20height%3D%22400%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Cpath%20d%3D%22M260%20170a30%2030%200%201%200%200-60%2030%2030%200%200%200%200%2060Zm-70%20110h220l-70-90-50%2060-35-45-65%2075Z%22%20fill%3D%22%2394a3b8%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2282%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%2364748b%22%20font-family%3D%22system-ui%2Csans-serif%22%20font-size%3D%2218%22%20font-weight%3D%22500%22%3ENo%20Photo%20Attached%3C%2Ftext%3E%3C%2Fsvg%3E";

  // --------------------------------------------------------------------------
  // 2. DOM Elements
  // --------------------------------------------------------------------------
  const issuesContainer = document.getElementById('issues-container');
  const filterPills = document.querySelectorAll('.filter-pill');

  // Dynamic Statistics Counters
  const statTotal = document.getElementById('stat-total');
  const statProgress = document.getElementById('stat-progress');
  const statResolved = document.getElementById('stat-resolved');

  if (!issuesContainer) {
    console.error('CivicFix: #issues-container not found on homepage.');
    return;
  }

  // In-memory cache of fetched issues for filtering
  let allIssues = [];
  let activeCategoryFilter = 'all';

  // --------------------------------------------------------------------------
  // 3. Helper Functions
  // --------------------------------------------------------------------------

  /**
   * Updates homepage statistics based on issues returned from the backend.
   * Maps statuses:
   * - Total: all issues
   * - approved: Issues In Progress
   * - done: Issues Resolved
   * Displays 0 for any count with no matching complaints.
   * @param {Array} issues
   */
  function updateStatistics(issues) {
    if (!statTotal || !statProgress || !statResolved) return;

    if (!Array.isArray(issues)) {
      resetStatisticsPlaceholder();
      return;
    }

    const total = issues.length;
    // approved = In Progress
    const inProgress = issues.filter(issue => issue.status === 'approved').length;
    // done = Resolved
    const resolved = issues.filter(issue => issue.status === 'done').length;

    statTotal.textContent = total.toLocaleString();
    statProgress.textContent = inProgress.toLocaleString();
    statResolved.textContent = resolved.toLocaleString();
  }

  /**
   * Resets statistics to a neutral placeholder while loading or on API error.
   */
  function resetStatisticsPlaceholder() {
    if (statTotal) statTotal.textContent = '-';
    if (statProgress) statProgress.textContent = '-';
    if (statResolved) statResolved.textContent = '-';
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
   * Builds an issue card DOM element safely using textContent to prevent HTML injection.
   * @param {Object} issue
   * @returns {HTMLElement} article.issue-card
   */
  function createIssueCard(issue) {
    const card = document.createElement('article');
    card.className = 'issue-card';

    // 1. Image wrapper with lazy loading and error fallback
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'issue-card-image-wrapper';

    const img = document.createElement('img');
    img.className = 'issue-card-img';
    img.alt = issue.title ? `Photo of ${issue.title}` : 'Civic issue photo';
    img.loading = 'lazy';
    img.src = issue.photoUrl || FALLBACK_IMAGE;

    // Gracefully handle broken or unreachable image URLs
    img.onerror = () => {
      img.onerror = null; // Prevent infinite loop if fallback fails
      img.src = FALLBACK_IMAGE;
    };

    // 2. Status badge (pending -> Submitted, approved -> In Progress, done -> Resolved)
    const statusConfig = STATUS_CONFIG[issue.status] || {
      label: issue.status || 'Submitted',
      className: 'status-submitted'
    };

    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${statusConfig.className}`;
    statusBadge.textContent = statusConfig.label;

    imageWrapper.appendChild(img);
    imageWrapper.appendChild(statusBadge);

    // 3. Card body
    const body = document.createElement('div');
    body.className = 'issue-card-body';

    // Category tag
    const categoryTag = document.createElement('span');
    categoryTag.className = 'issue-category-tag';
    categoryTag.textContent = CATEGORY_LABELS[issue.category] || issue.category || 'General Issue';

    // Title (safe textContent)
    const title = document.createElement('h3');
    title.className = 'issue-card-title';
    title.textContent = issue.title || 'Untitled Civic Issue';

    // Description (safe textContent)
    const desc = document.createElement('p');
    desc.className = 'issue-card-desc';
    desc.textContent = issue.description || 'No detailed description provided.';

    // 4. Card footer with location and timestamp
    const footer = document.createElement('div');
    footer.className = 'issue-card-footer';

    const locationDiv = document.createElement('div');
    locationDiv.className = 'issue-location';
    locationDiv.title = issue.location || 'Location not specified';

    // Pin icon (static non-user SVG)
    locationDiv.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `;

    // Location text (safe textContent)
    const locationSpan = document.createElement('span');
    locationSpan.textContent = issue.location || 'Location not specified';
    locationDiv.appendChild(locationSpan);

    // Date element
    const timeElem = document.createElement('time');
    if (issue.createdAt) {
      timeElem.dateTime = issue.createdAt;
      timeElem.textContent = formatDate(issue.createdAt);
    } else {
      timeElem.textContent = 'Recently';
    }

    footer.appendChild(locationDiv);
    footer.appendChild(timeElem);

    // Assemble card
    body.appendChild(categoryTag);
    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(footer);

    card.appendChild(imageWrapper);
    card.appendChild(body);

    return card;
  }

  // --------------------------------------------------------------------------
  // 4. State Rendering Functions
  // --------------------------------------------------------------------------

  function renderLoading() {
    issuesContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">
          Loading community reports...
        </p>
        <p style="font-size: 0.9rem;">Connecting to the CivicFix server.</p>
      </div>
    `;
  }

  function renderEmpty() {
    issuesContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1.5rem; background: var(--bg-card); border: 1.5px dashed var(--border-color); border-radius: var(--radius-md);">
        <p style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem;">
          No Reports Yet
        </p>
        <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 1.5rem; max-width: 480px; margin-left: auto; margin-right: auto;">
          There are currently no civic issues reported in the system. Be the first citizen to report an issue in your neighborhood!
        </p>
        <a href="report.html" class="btn btn-primary btn-lg">
          + Report an Issue
        </a>
      </div>
    `;
  }

  function renderError(errorMessage) {
    issuesContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: var(--radius-md); color: #991b1b;">
        <p style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem;">
          Unable to Load Community Reports
        </p>
        <p style="font-size: 0.9rem; margin-bottom: 1.25rem; color: #b91c1c;">
          Could not fetch issues from http://localhost:3000/api/issues. Ensure your Node.js backend server is running.
        </p>
        <button type="button" class="btn btn-outline" id="retry-btn" style="background: white;">
          🔄 Try Again
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', fetchIssues);
    }
  }

  /**
   * Filters and renders issues based on the currently selected category pill.
   */
  function renderIssuesList() {
    let filtered = allIssues;

    if (activeCategoryFilter !== 'all') {
      filtered = allIssues.filter(issue => {
        if (!issue.category) return false;
        const cat = issue.category.toLowerCase();

        if (activeCategoryFilter === 'pothole') {
          return cat.includes('pothole') || cat.includes('road');
        }
        if (activeCategoryFilter === 'streetlight') {
          return cat.includes('streetlight') || cat.includes('light');
        }
        if (activeCategoryFilter === 'garbage') {
          return cat.includes('garbage') || cat.includes('waste') || cat.includes('sanitation');
        }
        if (activeCategoryFilter === 'water_leak') {
          return cat.includes('water') || cat.includes('leak') || cat.includes('pipe');
        }
        if (activeCategoryFilter === 'hazards') {
          return cat.includes('drain') || cat.includes('hazard') || cat.includes('other');
        }
        return cat === activeCategoryFilter;
      });
    }

    if (filtered.length === 0) {
      if (allIssues.length === 0) {
        renderEmpty();
      } else {
        issuesContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">
              No issues in this category
            </p>
            <p style="font-size: 0.9rem;">Try selecting "All Issues" to see all reports.</p>
          </div>
        `;
      }
      return;
    }

    // Clear container and append each card safely
    issuesContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filtered.forEach(issue => {
      const card = createIssueCard(issue);
      fragment.appendChild(card);
    });

    issuesContainer.appendChild(fragment);
  }

  // --------------------------------------------------------------------------
  // 5. Fetch Issues from Backend
  // --------------------------------------------------------------------------
  async function fetchIssues() {
    renderLoading();
    resetStatisticsPlaceholder();

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      // Normalize array based on API response structure { success: true, count: N, data: [...] }
      if (result && Array.isArray(result.data)) {
        allIssues = result.data;
      } else if (Array.isArray(result)) {
        allIssues = result;
      } else {
        allIssues = [];
      }

      // Automatically update dynamic statistics from the loaded issues
      updateStatistics(allIssues);

      renderIssuesList();

    } catch (error) {
      console.error('CivicFix: Error fetching issues:', error);
      // Ensure misleading statistics are not shown when API fails
      resetStatisticsPlaceholder();
      renderError(error.message);
    }
  }

  // --------------------------------------------------------------------------
  // 6. Filter Pills Event Handlers
  // --------------------------------------------------------------------------
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const pillText = pill.textContent.trim().toLowerCase();

      if (pillText.includes('all')) {
        activeCategoryFilter = 'all';
      } else if (pillText.includes('pothole')) {
        activeCategoryFilter = 'pothole';
      } else if (pillText.includes('streetlight')) {
        activeCategoryFilter = 'streetlight';
      } else if (pillText.includes('garbage')) {
        activeCategoryFilter = 'garbage';
      } else if (pillText.includes('water')) {
        activeCategoryFilter = 'water_leak';
      } else if (pillText.includes('hazard')) {
        activeCategoryFilter = 'hazards';
      } else {
        activeCategoryFilter = 'all';
      }

      renderIssuesList();
    });
  });

  // Initial load
  fetchIssues();
});
