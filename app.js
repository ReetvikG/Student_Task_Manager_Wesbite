/**
 * StudyDesk - Student Task & Assignment Manager Frontend Logic
 * Modern, responsive, light-themed client with real-time tracking,
 * animations, and secure authentication.
 */

(function () {
  'use strict';

  // ---------- State ----------
  let tasks = [];
  let currentUser = null;
  let activeFilter = 'all'; // all, pending, done, overdue
  let activePriority = 'all';
  let activeSubject = 'all';
  let activeSort = 'deadline';
  let taskPendingDeletion = null;

  // ---------- Priority Ranks ----------
  const priorityRank = { High: 0, Medium: 1, Low: 2 };

  // ---------- Motivational Quotes ----------
  const quotes = [
    "✨ Small steps every day lead to big grades.",
    "🎯 Stay focused, the semester is yours to conquer.",
    "💡 Understanding beats memorizing every single time.",
    "🚀 Don't watch the clock; do what it does. Keep going.",
    "🌱 Success is the sum of small efforts repeated daily.",
    "🏆 One assignment at a time. You've got this!"
  ];

  // ---------- DOM Helpers ----------
  const $ = selector => document.querySelector(selector);
  const $$ = selector => document.querySelectorAll(selector);

  const esc = str => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  };

  function toast(message, duration = 2400) {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ---------- Date Calculations ----------
  function getTodayDate() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getDaysLeft(deadlineStr) {
    if (!deadlineStr) return 999;
    const due = new Date(deadlineStr + 'T00:00:00');
    const diff = due.getTime() - getTodayDate().getTime();
    return Math.round(diff / 86400000);
  }

  function formatDeadlineChip(t) {
    if (!t.deadline) return '';
    const d = getDaysLeft(t.deadline);
    if (t.done) {
      return `<span class="badge badge-deadline">Completed on ${esc(t.deadline)}</span>`;
    }
    if (d < 0) {
      const daysOver = Math.abs(d);
      return `<span class="badge badge-deadline overdue">⚠️ Overdue by ${daysOver} day${daysOver === 1 ? '' : 's'}</span>`;
    }
    if (d === 0) {
      return `<span class="badge badge-deadline due-soon">⏳ Due today</span>`;
    }
    if (d === 1) {
      return `<span class="badge badge-deadline due-soon">⏳ Due tomorrow</span>`;
    }
    if (d <= 3) {
      return `<span class="badge badge-deadline due-soon">📅 Due in ${d} days (${esc(t.deadline)})</span>`;
    }
    return `<span class="badge badge-deadline">📅 Due in ${d} days (${esc(t.deadline)})</span>`;
  }

  // ---------- API Service with Auth Headers ----------
  function getAuthToken() {
    return localStorage.getItem('studyDeskToken');
  }

  function setAuthToken(token) {
    if (token) localStorage.setItem('studyDeskToken', token);
    else localStorage.removeItem('studyDeskToken');
  }

  async function apiRequest(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    options.headers = headers;

    try {
      const resp = await fetch(endpoint, options);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 401) {
          // Token expired or invalid
          setAuthToken(null);
          currentUser = null;
          renderNavAuth();
        }
        throw new Error(data.error || 'Network request failed');
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  // ---------- Authentication Handlers ----------
  async function initAuth() {
    const token = getAuthToken();
    if (token) {
      try {
        const resp = await apiRequest('/api/auth/me');
        if (resp.user) {
          currentUser = resp.user;
          renderNavAuth();
          await loadTasks();
          return;
        }
      } catch (e) {
        console.warn('Session expired, logging in as demo...', e);
      }
    }

    // Auto-login as default demo account on first visit so user gets an instant working dashboard!
    await loginWithCredentials('student', 'password123', true);
  }

  async function loginWithCredentials(username, password, silent = false) {
    try {
      const resp = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password }
      });
      setAuthToken(resp.token);
      currentUser = resp.user;
      renderNavAuth();
      closeModal('authModal');
      if (!silent) toast(`👋 Welcome back, <strong>${esc(currentUser.fullName)}</strong>!`);
      await loadTasks();
    } catch (err) {
      if (!silent) toast(`❌ ${esc(err.message)}`);
    }
  }

  async function registerAccount(fullName, username, email, password) {
    try {
      const resp = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { fullName, username, email, password }
      });
      setAuthToken(resp.token);
      currentUser = resp.user;
      renderNavAuth();
      closeModal('authModal');
      toast(`🎉 Account created! Welcome, <strong>${esc(currentUser.fullName)}</strong>!`);
      await loadTasks();
    } catch (err) {
      toast(`❌ ${esc(err.message)}`);
    }
  }

  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    setAuthToken(null);
    currentUser = null;
    renderNavAuth();
    tasks = [];
    renderDashboard();
    toast('👋 You have been logged out.');
    openModal('authModal');
  }

  function renderNavAuth() {
    const container = $('#authNavContainer');
    if (!container) return;

    if (currentUser) {
      const initials = currentUser.fullName
        ? currentUser.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'ST';
      container.innerHTML = `
        <div class="user-profile-pill">
          <div class="user-avatar" title="${esc(currentUser.email)}">${esc(initials)}</div>
          <span class="user-name">${esc(currentUser.fullName || currentUser.username)}</span>
          <button id="logoutBtn" class="logout-btn" title="Sign out" aria-label="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      `;
      $('#logoutBtn').addEventListener('click', logout);

      // Update welcome banner greeting
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      $('#userGreeting').textContent = `${timeGreeting}, ${currentUser.fullName.split(' ')[0]}!`;
    } else {
      container.innerHTML = `<button id="navLoginBtn" class="btn btn-outline btn-sm">Sign In</button>`;
      $('#navLoginBtn').addEventListener('click', () => openModal('authModal'));
      $('#userGreeting').textContent = 'Good day, Student!';
    }
  }

  // ---------- Task Management ----------
  async function loadTasks() {
    if (!currentUser) return;
    try {
      tasks = await apiRequest('/api/tasks');
      populateSubjectDropdown();
      renderDashboard();
    } catch (err) {
      toast(`⚠️ Could not load assignments: ${esc(err.message)}`);
    }
  }

  function populateSubjectDropdown() {
    const sel = $('#subjectFilter');
    if (!sel) return;
    const currentVal = sel.value;
    const subjects = new Set();
    tasks.forEach(t => {
      if (t.subject && t.subject.trim()) subjects.add(t.subject.trim());
    });

    let html = `<option value="all">All Subjects (${tasks.length})</option>`;
    Array.from(subjects).sort().forEach(sub => {
      const count = tasks.filter(t => t.subject === sub).length;
      html += `<option value="${esc(sub)}">${esc(sub)} (${count})</option>`;
    });
    sel.innerHTML = html;
    if (Array.from(subjects).includes(currentVal)) {
      sel.value = currentVal;
    }
  }

  function renderDashboard() {
    // 1. Stats calculation
    const total = tasks.length;
    const doneTasks = tasks.filter(t => t.done);
    const doneCount = doneTasks.length;
    const pendingCount = total - doneCount;
    const overdueTasks = tasks.filter(t => !t.done && t.deadline && getDaysLeft(t.deadline) < 0);
    const overdueCount = overdueTasks.length;

    const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

    // Update stat numbers
    $('#sTotal').textContent = total;
    $('#sPending').textContent = pendingCount;
    $('#sDone').textContent = doneCount;
    $('#sOverdue').textContent = overdueCount;

    // Update tab counts
    $('#countAll').textContent = total;
    $('#countPending').textContent = pendingCount;
    $('#countDone').textContent = doneCount;
    $('#countOverdue').textContent = overdueCount;

    // Update Circular Ring
    $('#ringPct').textContent = `${pct}%`;
    const circumference = 301.59; // 2 * PI * 48
    const offset = circumference - (pct / 100) * circumference;
    const fg = $('#progressRingFg');
    if (fg) {
      fg.style.strokeDashoffset = offset;
      if (pct === 100 && total > 0) {
        fg.style.stroke = 'var(--p-low)';
      } else {
        fg.style.stroke = 'var(--primary)';
      }
    }
    $('#progressSummary').textContent = `${doneCount} of ${total} assignments completed`;

    const encEl = $('#encouragementText');
    if (encEl) {
      if (total === 0) encEl.textContent = 'Add assignments to kickstart your study desk!';
      else if (pct === 100) encEl.textContent = '🎉 All assignments completed! Fantastic job!';
      else if (pct >= 75) encEl.textContent = '🔥 Almost at the finish line! Keep going!';
      else if (pct >= 50) encEl.textContent = '💪 Halfway through! Great momentum.';
      else if (overdueCount > 0) encEl.textContent = `⚠️ You have ${overdueCount} overdue item${overdueCount === 1 ? '' : 's'}. Review first!`;
      else encEl.textContent = '🌟 You are on track. Stay focused!';
    }

    // 2. Filter & Sort Tasks
    const q = ($('#searchInput').value || '').trim().toLowerCase();

    let filtered = tasks.filter(t => {
      // Status filter
      if (activeFilter === 'pending' && t.done) return false;
      if (activeFilter === 'done' && !t.done) return false;
      if (activeFilter === 'overdue' && (t.done || !t.deadline || getDaysLeft(t.deadline) >= 0)) return false;

      // Priority filter
      if (activePriority !== 'all' && t.priority !== activePriority) return false;

      // Subject filter
      if (activeSubject !== 'all' && t.subject !== activeSubject) return false;

      // Search query
      if (q) {
        const hay = `${t.title} ${t.subject || ''} ${t.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      // Completed tasks sink to bottom in deadline / priority view
      if (a.done !== b.done) return a.done ? 1 : -1;

      if (activeSort === 'priority') {
        const prDiff = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
        if (prDiff !== 0) return prDiff;
        return (a.deadline || '9999').localeCompare(b.deadline || '9999');
      }
      if (activeSort === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (activeSort === 'newest') {
        return b.id - a.id;
      }
      // Default: Deadline earliest first (overdue items at the very top)
      return (a.deadline || '9999').localeCompare(b.deadline || '9999');
    });

    // 3. Render List
    const listEl = $('#taskList');
    if (!listEl) return;

    if (filtered.length === 0) {
      let emptyMsg = 'Your study desk is clear! Add your first assignment above.';
      if (tasks.length > 0) {
        emptyMsg = 'No assignments match the selected filters or search terms.';
      }
      listEl.innerHTML = `
        <li class="empty-state">
          <div class="empty-icon">📝</div>
          <h3 class="empty-title">No assignments found</h3>
          <p class="empty-subtitle">${emptyMsg}</p>
          <button class="btn btn-primary btn-sm" id="emptyAddBtn">
            + Add New Assignment
          </button>
        </li>
      `;
      const emptyAddBtn = $('#emptyAddBtn');
      if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => openModal('addTaskModal'));
      return;
    }

    listEl.innerHTML = filtered.map(t => `
      <li class="task-card priority-${esc(t.priority)} ${t.done ? 'is-done' : ''}" data-id="${t.id}">
        <!-- Checkbox -->
        <button class="task-check-btn" data-action="toggle" data-id="${t.id}" title="${t.done ? 'Mark as incomplete' : 'Mark as complete'}" aria-label="Toggle completion">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>

        <!-- Body -->
        <div class="task-body">
          <h3 class="task-title">${esc(t.title)}</h3>
          ${t.description ? `<p class="task-desc">${esc(t.description)}</p>` : ''}
          <div class="task-chips">
            <span class="badge badge-priority-${esc(t.priority)}">
              ${t.priority === 'High' ? '🔴' : t.priority === 'Low' ? '🟢' : '🟡'} ${esc(t.priority)}
            </span>
            ${t.subject ? `<span class="badge badge-subject">📖 ${esc(t.subject)}</span>` : ''}
            ${formatDeadlineChip(t)}
          </div>
        </div>

        <!-- Actions -->
        <div class="task-actions">
          <button class="task-action-btn edit-btn" data-action="edit" data-id="${t.id}" title="Edit Assignment" aria-label="Edit assignment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="task-action-btn del-btn" data-action="delete" data-id="${t.id}" title="Delete Assignment" aria-label="Delete assignment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </li>
    `).join('');
  }

  // ---------- Modal Management ----------
  function openModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    const firstInput = modal.querySelector('input:not([type=hidden]), textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // Close modals when clicking backdrop or close buttons
  document.addEventListener('click', e => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      closeModal(closeBtn.dataset.close);
      return;
    }
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('is-open');
      e.target.setAttribute('aria-hidden', 'true');
    }
  });

  // Esc key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $$('.modal-backdrop.is-open').forEach(m => {
        m.classList.remove('is-open');
        m.setAttribute('aria-hidden', 'true');
      });
    }
  });

  // ---------- Add Assignment Form ----------
  function setDefaultAddDeadline(daysAhead = 1) {
    const d = new Date(Date.now() + daysAhead * 86400000);
    const str = d.toISOString().slice(0, 10);
    const el = $('#addDeadline');
    if (el) el.value = str;
  }

  $('#addTaskForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value.trim();
    const subject = form.subject.value.trim();
    const deadline = form.deadline.value;
    const priority = form.priority.value;
    const description = form.description.value.trim();

    if (!title) {
      toast('⚠️ Title is required.');
      return;
    }

    try {
      await apiRequest('/api/tasks', {
        method: 'POST',
        body: { title, subject, deadline, priority, description }
      });
      form.reset();
      setDefaultAddDeadline(1);
      closeModal('addTaskModal');
      toast('✨ Assignment saved successfully!');
      await loadTasks();
    } catch (err) {
      toast(`❌ ${esc(err.message)}`);
    }
  });

  // Quick Date Chips in Add Modal
  $$('.quick-date-chips button').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.setdate, 10);
      setDefaultAddDeadline(days);
    });
  });

  // Open Add Modal Buttons
  $('#openAddModalBtn').addEventListener('click', () => {
    setDefaultAddDeadline(1);
    openModal('addTaskModal');
  });
  $('#inlineAddBtn').addEventListener('click', () => {
    setDefaultAddDeadline(1);
    openModal('addTaskModal');
  });
  $('#mobileFab').addEventListener('click', () => {
    setDefaultAddDeadline(1);
    openModal('addTaskModal');
  });

  // ---------- Edit Assignment Form ----------
  function openEditModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    $('#editTaskId').value = task.id;
    $('#editTitle').value = task.title || '';
    $('#editSubject').value = task.subject || '';
    $('#editPriority').value = task.priority || 'Medium';
    $('#editDeadline').value = task.deadline || '';
    $('#editStatus').value = String(task.done);
    $('#editDescription').value = task.description || '';

    openModal('editTaskModal');
  }

  $('#editTaskForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const id = parseInt(form.id.value, 10);
    const title = form.title.value.trim();
    const subject = form.subject.value.trim();
    const priority = form.priority.value;
    const deadline = form.deadline.value;
    const done = form.done.value === 'true';
    const description = form.description.value.trim();

    try {
      await apiRequest(`/api/tasks/${id}`, {
        method: 'PUT',
        body: { title, subject, priority, deadline, done, description }
      });
      closeModal('editTaskModal');
      toast('✏️ Assignment updated!');
      await loadTasks();
    } catch (err) {
      toast(`❌ ${esc(err.message)}`);
    }
  });

  // ---------- Delete Assignment ----------
  function openDeleteModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    taskPendingDeletion = task;
    $('#deleteTaskTitle').textContent = `"${task.title}"`;
    openModal('deleteModal');
  }

  $('#confirmDeleteBtn').addEventListener('click', async () => {
    if (!taskPendingDeletion) return;
    const id = taskPendingDeletion.id;
    try {
      await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
      closeModal('deleteModal');
      toast('🗑️ Assignment removed.');
      taskPendingDeletion = null;
      await loadTasks();
    } catch (err) {
      toast(`❌ ${esc(err.message)}`);
    }
  });

  // ---------- Task List Actions Delegation ----------
  $('#taskList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const act = btn.dataset.action;

    if (act === 'toggle') {
      try {
        const updated = await apiRequest(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
        if (updated.done) {
          toast('🎉 Task marked as complete! Great work!');
        } else {
          toast('⏳ Task moved back to pending.');
        }
        await loadTasks();
      } catch (err) {
        toast(`❌ ${esc(err.message)}`);
      }
    } else if (act === 'edit') {
      openEditModal(id);
    } else if (act === 'delete') {
      openDeleteModal(id);
    }
  });

  // ---------- Filter & Search Listeners ----------
  $('#filterTabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    $$('#filterTabs .tab-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    activeFilter = btn.dataset.filter;
    renderDashboard();
  });

  $('#searchInput').addEventListener('input', () => renderDashboard());

  $('#subjectFilter').addEventListener('change', e => {
    activeSubject = e.target.value;
    renderDashboard();
  });

  $('#priorityFilter').addEventListener('change', e => {
    activePriority = e.target.value;
    renderDashboard();
  });

  $('#sortBy').addEventListener('change', e => {
    activeSort = e.target.value;
    renderDashboard();
  });

  // ---------- Auth Modal Switcher ----------
  $('#authTabLogin').addEventListener('click', () => {
    $('#authTabLogin').classList.add('active');
    $('#authTabRegister').classList.remove('active');
    $('#loginForm').style.display = 'grid';
    $('#registerForm').style.display = 'none';
    $('#authModalTitle').textContent = 'Sign In to StudyDesk';
  });

  $('#authTabRegister').addEventListener('click', () => {
    $('#authTabRegister').classList.add('active');
    $('#authTabLogin').classList.remove('active');
    $('#loginForm').style.display = 'none';
    $('#registerForm').style.display = 'grid';
    $('#authModalTitle').textContent = 'Create Student Account';
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const u = e.target.username.value.trim();
    const p = e.target.password.value;
    await loginWithCredentials(u, p);
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fullName = e.target.fullName.value.trim();
    const username = e.target.username.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    await registerAccount(fullName, username, email, password);
  });

  $('#demoLoginBtn').addEventListener('click', async () => {
    await loginWithCredentials('student', 'password123');
  });

  // ---------- Theme Switcher ----------
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('studyDeskTheme', t);
    const icon = $('#themeIcon');
    if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  $('#themeToggleBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'pastel';
    setTheme(cur === 'pastel' ? 'dark' : 'pastel');
  });

  // Initialize theme: pastel light by default
  const savedTheme = localStorage.getItem('studyDeskTheme') || 'pastel';
  setTheme(savedTheme);

  // ---------- Date & Motivation Header ----------
  function initHeader() {
    const now = new Date();
    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    const dateEl = $('#currentDateStr');
    if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, options);

    // Pick random motivational quote
    const quoteEl = $('#motivationalQuote');
    if (quoteEl) {
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      quoteEl.innerHTML = `<span class="sparkle">✨</span> ${q}`;
    }
  }

  // ---------- Initialization ----------
  initHeader();
  setDefaultAddDeadline(1);
  initAuth();

})();
