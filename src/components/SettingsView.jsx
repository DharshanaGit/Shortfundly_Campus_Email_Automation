'use client';

import React, { useState, useEffect } from 'react';
import styles from './SettingsView.module.css';
import {
  ServerIcon,
  UserPlusIcon,
  LockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CloseIcon,
  RefreshCwIcon,
  UserIcon,
} from './Icons';

export default function SettingsView({ session }) {
  const isAdmin = true; // Full access for all users (no restrictions)
  const [activeSubTab, setActiveSubTab] = useState('smtp');
  const [feedback, setFeedback] = useState(null);

  // SMTP Settings State
  const [smtpForm, setSmtpForm] = useState({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: 'dharshana.shortfundly@gmail.com',
    pass: '',
    from_name: 'Campus Outreach Coordinator',
    from_email: 'campus@shortfundly.com',
    auth_method: 'app_password',
    smtp_enabled: true,
    simulation_mode: true,
  });
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // User Management State
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    role: 'manager',
    can_send: false,
  });
  const [addingUser, setAddingUser] = useState(false);


  // Load SMTP config (with client-side localStorage fallback for resilience across serverless cold starts)
  const fetchSmtpConfig = async () => {
    if (!isAdmin) return;

    let localSaved = null;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('shortfundly_google_smtp_config') : null;
      if (raw) localSaved = JSON.parse(raw);
    } catch {}

    // Immediately seed with client-stored config to avoid UI flicker
    if (localSaved?.user) {
      setSmtpForm((prev) => ({
        ...prev,
        user: (!localSaved.user || localSaved.user.toLowerCase().includes('campus@shortfundly'))
          ? 'dharshana.shortfundly@gmail.com'
          : localSaved.user,
        pass: localSaved.pass || prev.pass,
        from_email: localSaved.from_email || 'campus@shortfundly.com',
      }));
    }

    try {
      setLoadingSmtp(true);
      const res = await fetch('/api/admin/smtp');
      if (res.ok) {
        const data = await res.json();
        let effectiveUser = data.user;
        if (!effectiveUser || effectiveUser.toLowerCase().includes('campus@shortfundly')) {
          effectiveUser = 'dharshana.shortfundly@gmail.com';
        }

        let effectivePass = data.pass_masked || '';
        if (localSaved?.pass && !localSaved.pass.includes('•')) {
          effectivePass = localSaved.pass;
        }

        setSmtpForm({
          host: data.host || 'smtp.gmail.com',
          port: data.port || 465,
          secure: Boolean(data.secure),
          user: effectiveUser,
          pass: effectivePass,
          from_name: data.from_name || 'Shortfundly Campus Outreach',
          from_email: data.from_email || 'campus@shortfundly.com',
          auth_method: data.auth_method || 'app_password',
          smtp_enabled: data.smtp_enabled !== false,
          simulation_mode: Boolean(data.simulation_mode),
        });

        // Re-hydrate serverless backend if backend lost credentials on cold restart
        if (!data.is_configured && localSaved?.pass && !localSaved.pass.includes('•')) {
          fetch('/api/admin/smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              host: data.host || 'smtp.gmail.com',
              port: data.port || 465,
              secure: Boolean(data.secure),
              user: effectiveUser,
              pass: localSaved.pass,
              from_email: data.from_email || 'campus@shortfundly.com',
              from_name: data.from_name || 'Shortfundly Campus Outreach',
              auth_method: data.auth_method || 'app_password',
            }),
          }).catch(() => {});
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load SMTP configuration.' });
    } finally {
      setLoadingSmtp(false);
    }
  };

  // Load Users
  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load company users.' });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSmtpConfig();
      fetchUsers();
    }
  }, [isAdmin]);

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      setSavingSmtp(true);
      const targetUser = (!smtpForm.user || smtpForm.user.toLowerCase().includes('campus@shortfundly'))
        ? 'dharshana.shortfundly@gmail.com'
        : smtpForm.user.trim();

      const payload = {
        ...smtpForm,
        user: targetUser,
        from_email: (smtpForm.from_email || 'campus@shortfundly.com').trim(),
      };

      const res = await fetch('/api/admin/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Persist to browser localStorage permanently
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              'shortfundly_google_smtp_config',
              JSON.stringify({
                ...payload,
                pass: smtpForm.pass && !smtpForm.pass.includes('•') ? smtpForm.pass.trim() : undefined,
              })
            );
          }
        } catch {}

        setFeedback({ type: 'success', message: 'Google SMTP credentials and settings updated securely.' });
        fetchSmtpConfig();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to save SMTP settings.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error saving SMTP settings.' });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!isAdmin) return;
    try {
      setTestingSmtp(true);
      setTestResult(null);
      const res = await fetch('/api/admin/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smtpForm),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        setFeedback({ type: 'success', message: 'Google SMTP TLS handshake succeeded!' });
      } else {
        setFeedback({ type: 'error', message: data.message || 'SMTP Handshake failed.' });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Could not connect to SMTP server: ' + err.message,
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;

    try {
      setAddingUser(true);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: `Company account for ${newUser.email} created successfully.` });
        setIsAddUserOpen(false);
        setNewUser({ email: '', password: '', role: 'manager', can_send: false });
        fetchUsers();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to create user.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error creating company account.' });
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateUser = async (userId, changes) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, ...changes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', message: data.message || 'User updated.' });
        fetchUsers();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to update user.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error updating user.' });
    }
  };


  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>System Settings</h2>
          <p className={styles.description}>
            Authenticated Session & Access Profile
          </p>
        </div>

        <div className={styles.settingsCard}>
          <div className={styles.lockNotice}>
            <LockIcon size={32} />
            <div className={styles.lockTitle}>Administrator Access Required</div>
            <div className={styles.lockSub}>
              Google SMTP Gateway settings and Company User Management are restricted to Platform Administrators.
              Your current profile details are shown below.
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Account Email</label>
              <input type="text" className={styles.input} value={session?.email || ''} disabled />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Assigned Role</label>
              <input type="text" className={styles.input} value={session?.role || ''} disabled />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Outreach Send Permission</label>
              <input
                type="text"
                className={styles.input}
                value={session?.role === 'team_lead' || session?.can_send ? 'Enabled' : 'Disabled (View Only)'}
                disabled
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Authentication Mechanism</label>
              <input type="text" className={styles.input} value="Company JWT Session (HS256)" disabled />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>System Settings & Administration</h2>
        <p className={styles.description}>
          Configure production Google SMTP email gateway parameters and manage company user credentials, roles, and dispatch permissions.
        </p>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`${styles.feedbackBanner} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          {feedback.type === 'success' ? <CheckCircleIcon size={16} /> : <AlertCircleIcon size={16} />}
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ marginLeft: 'auto', color: 'inherit' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className={styles.tabNav}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'smtp' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('smtp')}
        >
          <ServerIcon size={16} />
          <span>Google SMTP Gateway</span>
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'users' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('users')}
        >
          <UserPlusIcon size={16} />
          <span>Company Accounts & Roles</span>
        </button>
      </div>

      {/* Tab 1: Google SMTP */}
      {activeSubTab === 'smtp' && (
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Google SMTP Server Configuration</div>
              <div className={styles.cardSubtitle}>
                Production mail delivery engine using Nodemailer pooled TLS connection to smtp.gmail.com.
              </div>
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleTestSmtp}
              disabled={testingSmtp || loadingSmtp}
            >
              <RefreshCwIcon size={14} />
              <span>{testingSmtp ? 'Testing Handshake...' : 'Test SMTP Handshake'}</span>
            </button>
          </div>

          {testResult && (
            <div className={`${styles.diagBox} ${testResult.success ? styles.diagSuccess : styles.diagFailure}`}>
              <div className={styles.diagTitle}>
                {testResult.success ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
                <span>
                  {testResult.success
                    ? 'Google SMTP Transport Verified Successfully'
                    : 'SMTP Handshake / Authentication Failed'}
                </span>
              </div>
              <div className={styles.diagDetail}>
                {testResult.success ? (
                  <>
                    Host: {testResult.host}:{testResult.port} (Secure TLS) &bull; Verified in{' '}
                    {testResult.response_time_ms}ms
                  </>
                ) : (
                  <>Error: {testResult.message || 'Failed to authenticate with Google SMTP.'}</>
                )}
              </div>
            </div>
          )}

          {/* Operational Switches: Master SMTP & Simulation Mode */}
          <div className={styles.switchPanel}>
            <div className={`${styles.switchCard} ${smtpForm.smtp_enabled ? styles.switchCardActive : ''}`}>
              <div className={styles.switchInfo}>
                <div className={styles.switchTitle}>
                  <span>Master SMTP Gateway</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: smtpForm.smtp_enabled ? '#ccfbf1' : '#fee2e2',
                    color: smtpForm.smtp_enabled ? '#0f766e' : '#b91c1c'
                  }}>
                    {smtpForm.smtp_enabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
                  </span>
                </div>
                <div className={styles.switchDesc}>
                  Master switch to enable or shut down all outbound SMTP connections immediately.
                </div>
              </div>
              <button
                type="button"
                className={`${styles.toggleSwitch} ${smtpForm.smtp_enabled ? styles.toggleSwitchOn : ''}`}
                onClick={() => setSmtpForm(prev => ({ ...prev, smtp_enabled: !prev.smtp_enabled }))}
                aria-label="Toggle SMTP Gateway"
              >
                <span className={`${styles.toggleThumb} ${smtpForm.smtp_enabled ? styles.toggleThumbOn : ''}`} />
              </button>
            </div>

            <div className={`${styles.switchCard} ${smtpForm.simulation_mode ? styles.switchCardWarning : ''}`}>
              <div className={styles.switchInfo}>
                <div className={styles.switchTitle}>
                  <span>Simulation Testing Mode</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: smtpForm.simulation_mode ? '#fef08a' : '#f1f5f9',
                    color: smtpForm.simulation_mode ? '#854d0e' : '#64748b'
                  }}>
                    {smtpForm.simulation_mode ? 'ACTIVE (TESTING)' : 'LIVE DISPATCH'}
                  </span>
                </div>
                <div className={styles.switchDesc}>
                  Simulate email dispatching for testing without sending real emails. Records full audit logs.
                </div>
              </div>
              <button
                type="button"
                className={`${styles.toggleSwitch} ${smtpForm.simulation_mode ? styles.toggleSwitchSim : ''}`}
                onClick={() => setSmtpForm(prev => ({ ...prev, simulation_mode: !prev.simulation_mode }))}
                aria-label="Toggle Simulation Mode"
              >
                <span className={`${styles.toggleThumb} ${smtpForm.simulation_mode ? styles.toggleThumbOn : ''}`} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveSmtp} autoComplete="off">
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>SMTP Host</label>
                <input
                  type="text"
                  name="sf_smtp_host_server"
                  id="sf_smtp_host_server"
                  autoComplete="off"
                  className={styles.input}
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  required
                />
                <span className={styles.inputHint}>Google SMTP: smtp.gmail.com</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>SMTP Port & Security</label>
                <select
                  name="sf_smtp_port_selection"
                  id="sf_smtp_port_selection"
                  className={styles.select}
                  value={smtpForm.port}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    setSmtpForm({
                      ...smtpForm,
                      port,
                      secure: port === 465,
                    });
                  }}
                >
                  <option value={465}>Port 465 (SSL / Direct TLS - Recommended)</option>
                  <option value={587}>Port 587 (STARTTLS)</option>
                </select>
                <span className={styles.inputHint}>Use 465 with SSL for encrypted Google mail flow</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Google Account / SMTP Username</label>
                <input
                  type="text"
                  inputMode="email"
                  name="sf_smtp_auth_user_identity"
                  id="sf_smtp_auth_user_identity"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className={styles.input}
                  value={smtpForm.user}
                  onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                  placeholder="dharshana.shortfundly@gmail.com"
                  required
                />
                <span className={styles.inputHint}>
                  Fixed Google authentication account: <strong>dharshana.shortfundly@gmail.com</strong>
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Google App Password (16 Characters)</label>
                <input
                  type="password"
                  name="sf_smtp_auth_user_token"
                  id="sf_smtp_auth_user_token"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className={styles.input}
                  value={smtpForm.pass}
                  onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                  placeholder="Enter 16-character Google App Password"
                />
                <span className={styles.inputHint}>
                  Masked for security. Stored permanently for delivery. Leave bullets to keep saved password.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Sender Display Name</label>
                <input
                  type="text"
                  name="sf_sender_display_name"
                  id="sf_sender_display_name"
                  autoComplete="off"
                  className={styles.input}
                  value={smtpForm.from_name}
                  onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })}
                  placeholder="Campus Outreach Coordinator"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Sender / Reply-To Email</label>
                <input
                  type="email"
                  name="sf_sender_reply_to_email"
                  id="sf_sender_reply_to_email"
                  autoComplete="off"
                  className={styles.input}
                  value={smtpForm.from_email}
                  onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })}
                  placeholder="campus@shortfundly.com"
                />
                <span className={styles.inputHint}>
                  Replies route to official campus inbox: <strong>campus@shortfundly.com</strong>
                </span>
              </div>
            </div>

            <div className={styles.actionsBar}>
              <div className={styles.leftActions}>
                <span className={styles.inputHint}>
                  Changes take effect immediately across all background and manual dispatch workers.
                </span>
              </div>
              <div className={styles.rightActions}>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={savingSmtp || loadingSmtp}
                >
                  {savingSmtp ? 'Saving Configuration...' : 'Save Google SMTP Settings'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Company Accounts & Roles */}
      {activeSubTab === 'users' && (
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Company User Directory & RBAC Roles</div>
              <div className={styles.cardSubtitle}>
                Manage team directory, assign RBAC roles (Admin, Team Lead, Manager), and regulate outreach sending rights. In-app password alteration is disabled under cybersecurity policy.
              </div>
            </div>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setIsAddUserOpen(true)}
            >
              <UserPlusIcon size={16} />
              <span>Add Company Account</span>
            </button>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Role</th>
                  <th>Outreach Send Right</th>
                  <th>Account Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === session?.userId;
                  const canSend = u.role === 'admin' || u.role === 'team_lead' || Boolean(u.can_send);

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UserIcon size={14} />
                          <strong>{u.email}</strong>
                          {isSelf && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(You)</span>
                          )}
                        </div>
                      </td>

                      <td>
                        <select
                          className={styles.roleSelect}
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                        >
                          <option value="admin">Administrator</option>
                          <option value="team_lead">Team Lead</option>
                          <option value="manager">Manager</option>
                        </select>
                      </td>

                      <td>
                        {u.role === 'manager' ? (
                          <button
                            type="button"
                            className={`${styles.sendToggle} ${u.can_send ? styles.sendAllowed : styles.sendDenied}`}
                            onClick={() => handleUpdateUser(u.id, { can_send: !u.can_send })}
                          >
                            {u.can_send ? 'Send Enabled' : 'Send Disabled'}
                          </button>
                        ) : (
                          <span className={`${styles.sendToggle} ${styles.sendAllowed}`}>
                            Always Allowed ({u.role === 'admin' ? 'Admin' : 'Team Lead'})
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`${styles.statusToggle} ${u.is_active ? styles.statusActive : styles.statusInactive}`}
                          disabled={isSelf}
                          onClick={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                          title={isSelf ? 'Cannot deactivate self' : 'Toggle active status'}
                        >
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </button>
                      </td>

                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsAddUserOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateUser}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Add New Company Account</div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setIsAddUserOpen(false)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Company Email Address</label>
                  <input
                    type="email"
                    className={styles.input}
                    placeholder="e.g. outreach.lead@organization.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Temporary Password (min 8 chars)</label>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Enter strong password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Access Role</label>
                  <select
                    className={styles.select}
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="manager">Manager (Read-only by default, assignable send)</option>
                    <option value="team_lead">Team Lead (Outreach, Templates, Full Sending)</option>
                    <option value="admin">Administrator (Complete System & User Control)</option>
                  </select>
                </div>

                {newUser.role === 'manager' && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={newUser.can_send}
                      onChange={(e) => setNewUser({ ...newUser, can_send: e.target.checked })}
                    />
                    <span>Grant outreach email sending authorization</span>
                  </label>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsAddUserOpen(false)}
                  disabled={addingUser}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={addingUser}
                >
                  {addingUser ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}
