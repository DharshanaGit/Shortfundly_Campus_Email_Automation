'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';
import Sidebar from '@/components/Sidebar.jsx';
import StatsCards from '@/components/StatsCards.jsx';
import ManualEntryForm from '@/components/ManualEntryForm.jsx';
import BulkEmailSender from '@/components/BulkEmailSender.jsx';
import CampaignWorkflowSender from '@/components/CampaignWorkflowSender.jsx';
import CampaignTrackingView from '@/components/CampaignTrackingView.jsx';
import EmailReviewModal from '@/components/EmailReviewModal.jsx';
import EmailRecordsTable from '@/components/EmailRecordsTable.jsx';
import TemplateManager from '@/components/TemplateManager.jsx';
import SettingsView from '@/components/SettingsView.jsx';
import SmtpDiagnosticsModal from '@/components/SmtpDiagnosticsModal.jsx';
import MonitoringDashboard from '@/components/MonitoringDashboard.jsx';
import CollegeDataIngestionView from '@/components/CollegeDataIngestionView.jsx';
import {
  RefreshCwIcon,
  ServerIcon,
  SendIcon,
  MailIcon,
  GlobeIcon,
  BarChartIcon
} from '@/components/Icons.jsx';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [senderSubMode, setSenderSubMode] = useState('bulk'); // 'bulk' | 'manual'

  // Stats & Logs state
  const [stats, setStats] = useState({
    total: 0,
    accepted: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    unknown: 0,
    duplicates_blocked: 0,
  });

  const [templates, setTemplates] = useState([]);
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [activeFormData, setActiveFormData] = useState(null);
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // 1. Authenticate user
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          router.push('/login');
        }
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  // 2. Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/outreach/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('[Dashboard] Stats fetch error:', err);
    }
  }, []);

  // 3. Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/outreach/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('[Dashboard] Templates fetch error:', err);
    }
  }, []);

  // 4. Fetch logs (merges server records with client single dispatches ledger)
  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('limit', '50');

      let serverRecords = [];
      let totalCount = 0;

      const res = await fetch(`/api/outreach/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        serverRecords = data.records || [];
        totalCount = data.total || 0;
      }

      // Check persistent client ledger for any locally dispatched single emails
      let localRecords = [];
      try {
        const raw = localStorage.getItem('sf_single_dispatches_ledger');
        if (raw) localRecords = JSON.parse(raw);
      } catch {}

      const map = new Map();
      for (const rec of serverRecords) {
        map.set(rec.id, rec);
      }
      for (const rec of localRecords) {
        if (!map.has(rec.id)) {
          map.set(rec.id, rec);
        }
      }

      let combined = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at || b.sent_at || 0) - new Date(a.created_at || a.sent_at || 0)
      );

      // Apply search query filter if present
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        combined = combined.filter(
          (r) =>
            (r.college_name && r.college_name.toLowerCase().includes(q)) ||
            (r.email && r.email.toLowerCase().includes(q)) ||
            (r.department && r.department.toLowerCase().includes(q)) ||
            (r.subject && r.subject.toLowerCase().includes(q))
        );
      }

      // Apply status filter if present
      if (statusFilter !== 'all') {
        combined = combined.filter((r) => r.status === statusFilter || (statusFilter === 'ACCEPTED' && r.delivery_status === 'SMTP_ACCEPTED'));
      }

      setRecords(combined);
      setTotalRecords(Math.max(totalCount, combined.length));
    } catch (err) {
      console.error('[Dashboard] Logs fetch error:', err);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchTemplates();
      fetchLogs();
    }
  }, [user, activeTab, fetchStats, fetchTemplates, fetchLogs]);

  // Handlers
  const handleOpenReview = (formData) => {
    setActiveFormData(formData);
    setReviewModalOpen(true);
  };

  const handleOutreachSuccess = () => {
    fetchStats();
    fetchLogs();
  };

  const handleRetryRecord = async (recordId) => {
    setRetryingId(recordId);
    try {
      const res = await fetch('/api/outreach/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to retry outreach.');
      }
      fetchStats();
      fetchLogs();
    } catch {
      alert('Network error while retrying outreach.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    setDeletingId(recordId);
    try {
      const res = await fetch('/api/outreach/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete outreach record.');
      } else {
        fetchStats();
        fetchLogs();
      }
    } catch {
      alert('Network error while deleting outreach record.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/');
    }
  };

  const getViewTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'campaigns':
        return 'Mails tracker';
      case 'monitoring':
        return 'Monthly Automation & Monitoring';
      case 'sender':
        return senderSubMode === 'manual'
          ? 'Single Email'
          : 'Bulk Campaign';
      case 'templates':
        return 'Email Templates';
      case 'settings':
        return 'Settings';
      default:
        return 'Campus Email Automation Platform';
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingOverlay}>
        <RefreshCwIcon size={32} className={styles.loadingSpinner} />
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardWrapper}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        session={user}
        onLogout={handleLogout}
      />

      {/* Main Dynamic Viewport */}
      <div className={styles.mainArea}>
        {/* Sticky Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.breadcrumbArea}>
            <span className={styles.viewTitle}>{getViewTitle()}</span>
            <span className={styles.viewTagline}>&bull; Campus Email Automation Platform</span>
          </div>

          <div className={styles.topBarRight}>
            <div className={styles.statusPill}>
              <span className={styles.statusDot} />
              <span>Connected</span>
            </div>

            <button
              type="button"
              className={styles.smtpBtn}
              onClick={() => setSmtpModalOpen(true)}
              title="Check Google SMTP email settings"
            >
              <ServerIcon size={14} />
              <span>Google SMTP</span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className={styles.pageContent}>
          {/* TAB 1: Command Overview */}
          {activeTab === 'dashboard' && (
            <>
              <div className={styles.introSection}>
                <h1 className={styles.headline}>Email Outreach Dashboard</h1>
                <p className={styles.subheadline}>
                  Monitor email activity, view real-time delivery logs, and check campaign statistics.
                </p>
              </div>

              {/* Real-time KPI Stats */}
              <StatsCards stats={stats} />

              {/* Email Audit & Records Table */}
              <EmailRecordsTable
                records={records}
                total={totalRecords}
                currentStatus={statusFilter}
                searchQuery={searchQuery}
                onStatusChange={setStatusFilter}
                onSearchChange={setSearchQuery}
                onRefresh={() => {
                  fetchStats();
                  fetchLogs();
                }}
                onRetryRecord={handleRetryRecord}
                isRetryingId={retryingId}
                onDeleteRecord={handleDeleteRecord}
                isDeletingId={deletingId}
              />
            </>
          )}

          {/* TAB 2: Campaign Tracking & Reports */}
          {activeTab === 'campaigns' && (
            <CampaignTrackingView session={user} />
          )}

          {/* TAB: College Data Ingestion & Spreadsheet Review */}
          {activeTab === 'ingestion' && (
            <CollegeDataIngestionView
              session={user}
              templates={templates}
              onNavigateTab={setActiveTab}
            />
          )}

          {/* TAB: Monthly College Automation & Monitoring */}
          {activeTab === 'monitoring' && (
            <MonitoringDashboard session={user} />
          )}

          {/* TAB 3: Campus Dispatcher */}
          {activeTab === 'sender' && (
            <>
              <div className={styles.introSection}>
                <h1 className={styles.headline}>Send Emails to Colleges</h1>
                <p className={styles.subheadline}>
                  Select colleges from the directory or import your spreadsheet, customize your template, and send safely.
                </p>
              </div>

              {/* Sender Mode Switcher */}
              <div className={styles.modeSwitcher}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${senderSubMode === 'bulk' ? styles.modeBtnActive : ''}`}
                  onClick={() => setSenderSubMode('bulk')}
                >
                  <MailIcon size={14} />
                  <span>Bulk Campaign</span>
                </button>

                <button
                  type="button"
                  className={`${styles.modeBtn} ${senderSubMode === 'manual' ? styles.modeBtnActive : ''}`}
                  onClick={() => setSenderSubMode('manual')}
                >
                  <SendIcon size={14} />
                  <span>Single Email</span>
                </button>
              </div>

              {senderSubMode === 'bulk' && (
                <BulkEmailSender
                  templates={templates}
                  session={user}
                  onCampaignFinished={handleOutreachSuccess}
                />
              )}

              {senderSubMode === 'manual' && (
                <ManualEntryForm
                  templates={templates}
                  onOpenReview={handleOpenReview}
                  user={user}
                />
              )}
            </>
          )}

          {/* TAB 4: Proposal Templates */}
          {activeTab === 'templates' && (
            <TemplateManager session={user} onTemplatesUpdated={fetchTemplates} />
          )}

          {/* TAB 5: System Settings */}
          {activeTab === 'settings' && (
            <SettingsView session={user} />
          )}
        </main>
      </div>

      {/* Email Review & Inline Edit Modal */}
      <EmailReviewModal
        isOpen={reviewModalOpen}
        initialData={activeFormData}
        templates={templates}
        user={user}
        onClose={() => setReviewModalOpen(false)}
        onSuccess={handleOutreachSuccess}
      />

      {/* SMTP Diagnostics Modal */}
      <SmtpDiagnosticsModal
        isOpen={smtpModalOpen}
        onClose={() => setSmtpModalOpen(false)}
      />
    </div>
  );
}
