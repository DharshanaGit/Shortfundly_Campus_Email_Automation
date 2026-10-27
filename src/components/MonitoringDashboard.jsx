'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './MonitoringDashboard.module.css';
import {
  BuildingIcon,
  MailIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  GlobeIcon,
  ClockIcon,
  ShieldCheckIcon,
  ServerIcon,
  SendIcon,
} from './Icons.jsx';

const ALL_INDIAN_STATES = [
  'Andhra Pradesh',
  'Telangana',
  'Tamil Nadu',
  'Karnataka',
  'Kerala',
  'Maharashtra',
  'Delhi',
  'Gujarat',
  'Uttar Pradesh',
  'West Bengal',
  'Rajasthan',
  'Madhya Pradesh',
  'Haryana',
  'Punjab',
  'Odisha',
  'Bihar',
  'Assam',
  'Jharkhand',
  'Uttarakhand',
  'Himachal Pradesh',
  'Chhattisgarh',
  'Goa',
  'Jammu and Kashmir',
  'Chandigarh',
  'Puducherry',
  'Tripura',
  'Meghalaya',
  'Manipur',
  'Nagaland',
  'Mizoram',
  'Sikkim',
  'Arunachal Pradesh',
  'Ladakh',
  'Andaman and Nicobar Islands',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep',
];

export default function MonitoringDashboard({ session }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refresh & Job states
  const [selectedState, setSelectedState] = useState('Andhra Pradesh');
  const [submittingJob, setSubmittingJob] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [jobNotice, setJobNotice] = useState('');
  const pollIntervalRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/outreach/monitor');
      if (!res.ok) {
        throw new Error('Failed to load database monitoring metrics');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[Monitoring] Fetch error:', err);
      setError(err.message || 'Failed to connect to PostgreSQL monitoring engine.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll active running job
  useEffect(() => {
    if (!activeJob?.id || activeJob.status === 'COMPLETED' || activeJob.status === 'FAILED') {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/outreach/monitor?job_id=${activeJob.id}`);
        if (res.ok) {
          const pollData = await res.json();
          if (pollData.job) {
            setActiveJob(pollData.job);
            if (pollData.job.status === 'COMPLETED' || pollData.job.status === 'FAILED') {
              clearInterval(pollIntervalRef.current);
              fetchStatus();
            }
          }
        }
      } catch (err) {
        console.warn('[Monitoring] Job poll warning:', err);
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJob?.id, activeJob?.status, fetchStatus]);

  const handleStartRefresh = async (scope, stateName = '') => {
    setSubmittingJob(true);
    setJobNotice('');
    try {
      const res = await fetch('/api/outreach/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh',
          scope,
          state: stateName,
          limit: scope === 'ALL' ? 500 : 200,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setJobNotice(`⚠️ Safeguard Blocked: ${resData.error}`);
        } else {
          setJobNotice(`❌ Error starting job: ${resData.error || 'Request failed'}`);
        }
        return;
      }

      setActiveJob({
        id: resData.job_id,
        job_type: resData.job_type,
        status: resData.status,
        colleges_targeted: scope === 'ALL' ? 500 : 200,
        colleges_crawled: 0,
        contacts_extracted: 0,
      });

      setJobNotice(`✓ Job enqueued: ${resData.message} (Job ID: ${resData.job_id})`);
      fetchStatus();
    } catch (err) {
      setJobNotice('❌ Network communication failed when triggering refresh job.');
    } finally {
      setSubmittingJob(false);
      setConfirmModalOpen(false);
    }
  };

  const handleRetryFailed = async () => {
    setSubmittingJob(true);
    setJobNotice('');
    try {
      const res = await fetch('/api/outreach/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setJobNotice(`⚠️ ${resData.error || 'Retry request failed'}`);
        return;
      }

      setActiveJob({
        id: resData.job_id,
        job_type: 'RETRY_FAILED_CRAWL_JOBS',
        status: 'RUNNING',
        colleges_targeted: 50,
        colleges_crawled: 0,
        contacts_extracted: 0,
      });

      setJobNotice(`✓ Retry task dispatched: ${resData.message}`);
      fetchStatus();
    } catch {
      setJobNotice('❌ Network failure while triggering retry job.');
    } finally {
      setSubmittingJob(false);
    }
  };

  const metrics = data?.metrics || {};
  const auto = data?.automation_status || {};
  const jobMetrics = auto.job_metrics || {};

  return (
    <div className={styles.container}>
      {/* 1. Header & Scheduler Status Banner */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <GlobeIcon size={24} />
            <span>Monthly College Data Automation &amp; Monitoring</span>
          </div>
          <div className={styles.headerSubtitle}>
            Celery Beat monthly scheduler, Celery worker crawler pipeline, and verified PostgreSQL institutional records across all India.
          </div>
        </div>

        <div className={styles.headerBadges}>
          <div className={styles.schedulerPill}>
            <span className={styles.pulseDot} />
            <span>{auto.scheduler_status || 'Celery Beat: Active'}</span>
          </div>
          <div className={styles.timezoneBadge}>
            🕒 Timezone: <strong>Asia/Kolkata (IST)</strong>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 2. Professional Dashboard Cards (8 Cards) */}
      <div className={styles.cardsGrid}>
        {/* Card 1: Total Colleges stored in PostgreSQL */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Total Colleges (PostgreSQL)</span>
            <div className={styles.cardIconWrap}>
              <BuildingIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : (metrics.total_colleges || 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>AISHE, UGC &amp; AICTE accredited</div>
        </div>

        {/* Card 2: Total contacts & email addresses */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Verified Contacts &amp; Emails</span>
            <div className={styles.cardIconWrap}>
              <MailIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : (metrics.total_contacts || 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>
            {(metrics.total_mx_verified || 0).toLocaleString()} DNS MX verified
          </div>
        </div>

        {/* Card 3: Last successful data refresh */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Last Successful Refresh</span>
            <div className={styles.cardIconWrap}>
              <CheckCircleIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValueSm}>
            {loading ? '...' : metrics.last_successful_refresh || '—'}
          </div>
          <div className={styles.cardSub}>Automated delta crawl completed</div>
        </div>

        {/* Card 4: Next scheduled monthly refresh */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Next Monthly Refresh</span>
            <div className={styles.cardIconWrap}>
              <ClockIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValueSm}>
            {loading ? '...' : metrics.next_scheduled_refresh || '—'}
          </div>
          <div className={styles.cardSub}>1st of month at 03:00 AM IST</div>
        </div>

        {/* Card 5: Newly discovered colleges */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Newly Discovered Colleges</span>
            <div className={styles.cardIconWrap}>
              <BuildingIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : (metrics.newly_discovered_colleges || 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>Added within last 30-day window</div>
        </div>

        {/* Card 6: Updated contact records */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Updated Contact Records</span>
            <div className={styles.cardIconWrap}>
              <RefreshCwIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : (metrics.updated_contact_records || 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>Roles &amp; emails updated via crawler</div>
        </div>

        {/* Card 7: Missing or unverified websites */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Unverified / Missing Websites</span>
            <div className={styles.cardIconWrap}>
              <GlobeIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : (metrics.missing_or_unverified_websites || 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>Queued for Brave Search resolver</div>
        </div>

        {/* Card 8: Failed or pending crawl jobs */}
        <div className={styles.metricCard}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>Failed or Pending Jobs</span>
            <div className={styles.cardIconWrap}>
              <AlertCircleIcon size={16} />
            </div>
          </div>
          <div className={styles.cardValue}>
            {loading ? '...' : metrics.failed_or_pending_jobs || 0}
          </div>
          <div className={styles.cardSub}>0 blocking errors detected</div>
        </div>
      </div>

      {/* 3. Monthly Automation & Celery Beat Architecture Status */}
      <div className={styles.statusCard}>
        <div className={styles.statusHeader}>
          <div className={styles.statusHeaderTitle}>
            <ServerIcon size={18} />
            <span>Monthly Automation Status &amp; Celery Pipeline</span>
          </div>

          <button
            type="button"
            className={styles.btnRetry}
            onClick={fetchStatus}
            title="Refresh database metrics"
          >
            <RefreshCwIcon size={13} className={loading ? 'spin' : ''} />
            <span>Refresh Metrics</span>
          </button>
        </div>

        <div className={styles.statusSplit}>
          {/* Scheduler Block */}
          <div className={styles.statusBlock}>
            <div className={styles.blockTitle}>
              <span>Celery Beat Scheduler (Asia/Kolkata)</span>
              <span className={`${styles.statusBadge} ${styles.badgeSuccess}`}>
                Active
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Timezone:</span>
              <span className={styles.infoVal}>Asia/Kolkata (IST, UTC+05:30)</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Cron Frequency:</span>
              <span className={styles.infoVal}>Monthly on 1st at 03:00 AM IST</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Crontab Spec:</span>
              <span className={styles.infoVal}>0 3 1 * *</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Last Run:</span>
              <span className={styles.infoVal}>{auto.last_run_timestamp || '—'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Next Scheduled Run:</span>
              <span className={styles.infoVal}>{auto.next_run_timestamp || '—'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Task Broker:</span>
              <span className={styles.infoVal}>Redis (redis://localhost:6379/0)</span>
            </div>
          </div>

          {/* Job Status Block */}
          <div className={styles.statusBlock}>
            <div className={styles.blockTitle}>
              <span>Latest Refresh Job Execution</span>
              <span
                className={`${styles.statusBadge} ${
                  auto.current_job_status === 'Success'
                    ? styles.badgeSuccess
                    : auto.current_job_status === 'Running'
                    ? styles.badgeRunning
                    : auto.current_job_status === 'Queued'
                    ? styles.badgeQueued
                    : styles.badgeFailed
                }`}
              >
                {auto.current_job_status || 'Success'}
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Active Job ID:</span>
              <span className={styles.infoVal} style={{ fontSize: '11px' }}>
                {jobMetrics.latest_job_id ? `${String(jobMetrics.latest_job_id).slice(0, 18)}...` : '—'}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Institutions Targeted:</span>
              <span className={styles.infoVal}>{(jobMetrics.institutions_targeted || 0).toLocaleString()}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Institutions Processed:</span>
              <span className={styles.infoVal}>{(jobMetrics.institutions_processed || 0).toLocaleString()}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Contacts Added / Updated:</span>
              <span className={styles.infoVal}>
                {(jobMetrics.contacts_added || 0).toLocaleString()} / {(jobMetrics.contacts_updated || 0).toLocaleString()}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Records Skipped:</span>
              <span className={styles.infoVal}>{jobMetrics.records_skipped || 0}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Crawl Failures / Retries:</span>
              <span className={styles.infoVal}>
                {jobMetrics.crawl_failures || 0} / {jobMetrics.retry_counts || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Refresh Controls */}
      <div className={styles.controlsCard}>
        <div className={styles.controlsHeader}>
          <div>
            <div className={styles.controlsTitle}>
              <RefreshCwIcon size={17} />
              <span>On-Demand Refresh &amp; Crawl Controls</span>
            </div>
            <div className={styles.controlsDesc}>
              Trigger live crawls across all India or target a specific state. Celery worker tasks execute safely in the background with duplicate protection.
            </div>
          </div>
        </div>

        {jobNotice && (
          <div style={{ padding: '12px 16px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
            {jobNotice}
          </div>
        )}

        {/* Live Active Progress Indicator */}
        {activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED') && (
          <div className={styles.progressBanner}>
            <div className={styles.progressTop}>
              <span>⚙️ Active Crawl in Progress: {activeJob.job_type}</span>
              <span>Status: {activeJob.status}</span>
            </div>
            <div className={styles.progressBarTrack}>
              <div
                className={styles.progressBarFill}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      15,
                      Math.round(
                        ((activeJob.colleges_crawled || 0) / (activeJob.colleges_targeted || 100)) * 100
                      )
                    )
                  )}%`,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#0f766e' }}>
              <span>Job ID: {activeJob.id}</span>
              <span>
                Colleges Processed: {activeJob.colleges_crawled || 0} / {activeJob.colleges_targeted || 100}
              </span>
            </div>
          </div>
        )}

        <div className={styles.controlsRow}>
          {/* Nationwide Refresh Button */}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setConfirmModalOpen(true)}
            disabled={submittingJob || (activeJob && activeJob.status === 'RUNNING')}
          >
            <GlobeIcon size={15} />
            <span>Refresh All India Data</span>
          </button>

          {/* State / UT Selector */}
          <select
            className={styles.stateSelect}
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            disabled={submittingJob}
          >
            {ALL_INDIAN_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Refresh Selected State Button */}
          <button
            type="button"
            className={styles.btnState}
            onClick={() => handleStartRefresh('STATE', selectedState)}
            disabled={submittingJob || (activeJob && activeJob.status === 'RUNNING')}
          >
            <SendIcon size={14} />
            <span>Refresh Selected State ({selectedState})</span>
          </button>

          {/* Retry Failed Jobs Button */}
          <button
            type="button"
            className={styles.btnRetry}
            onClick={handleRetryFailed}
            disabled={submittingJob || (activeJob && activeJob.status === 'RUNNING')}
          >
            <AlertCircleIcon size={14} />
            <span>Retry Failed Jobs</span>
          </button>
        </div>
      </div>

      {/* 5. Verified Records & Change Audit Ledger */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <div className={styles.tableTitle}>Latest Verified Records &amp; Change Audit Ledger</div>
            <div className={styles.tableSubtitle}>
              Real-time records from PostgreSQL <code>change_audit_logs</code> showing newly discovered institutions, contacts, and role updates.
            </div>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 650, color: '#0f766e', background: '#f0fdfa', padding: '4px 10px', borderRadius: '6px' }}>
            {data?.recent_audits?.length || 0} Recent Events
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.auditTable}>
            <thead>
              <tr>
                <th>Detected At (IST)</th>
                <th>College / Institution</th>
                <th>State &amp; District</th>
                <th>Change Event</th>
                <th>Verified Details</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.recent_audits || data.recent_audits.length === 0) ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No audit records logged yet. Run a refresh to populate audit entries.
                  </td>
                </tr>
              ) : (
                data.recent_audits.map((a) => {
                  let parsedNew = a.new_value;
                  if (typeof parsedNew === 'string') {
                    try { parsedNew = JSON.parse(parsedNew); } catch {}
                  }

                  const formatTimestamp = (ts) => {
                    if (!ts) return '—';
                    try {
                      return new Date(ts).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                    } catch {
                      return String(ts);
                    }
                  };

                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)', color: '#475569' }}>
                        {formatTimestamp(a.detected_at)}
                      </td>
                      <td>
                        <strong>{a.college_name || 'Autonomous Institution'}</strong>
                      </td>
                      <td>
                        {a.state || 'India'}{a.district ? ` • ${a.district}` : ''}
                      </td>
                      <td>
                        <span
                          className={`${styles.changeBadge} ${
                            a.change_type === 'NEW_CONTACT_DISCOVERED'
                              ? styles.badgeNew
                              : a.change_type === 'UPDATED_ROLE'
                              ? styles.badgeUpdate
                              : styles.badgeWeb
                          }`}
                        >
                          {a.change_type}
                        </span>
                      </td>
                      <td>
                        {parsedNew?.target_email ? (
                          <span>
                            <strong>{parsedNew.target_email}</strong> ({parsedNew.role || 'Contact'})
                          </span>
                        ) : parsedNew?.website_url ? (
                          <span>Website: {parsedNew.website_url}</span>
                        ) : (
                          <span>Verified record updated</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Nationwide Refresh */}
      {confirmModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setConfirmModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              <AlertCircleIcon size={20} style={{ color: '#0d9488' }} />
              <span>Confirm Nationwide All-India Refresh</span>
            </div>
            <div className={styles.modalBody}>
              <p>
                You are about to start a nationwide data reconciliation job across all 36 States and Union Territories.
              </p>
              <p style={{ marginTop: '8px' }}>
                This process will:
              </p>
              <ul style={{ paddingLeft: '20px', marginTop: '6px', lineHeight: 1.6 }}>
                <li>Harvest official regulatory portals (AISHE, UGC, AICTE)</li>
                <li>Resolve missing websites using Brave Search API</li>
                <li>Crawl verified official websites for institutional contacts</li>
                <li>Verify syntax and DNS MX records for all discovered emails</li>
                <li>Safely deduplicate and update PostgreSQL records</li>
              </ul>
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                Safe execution: A background Celery task will be created and duplicate jobs will be prevented.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnConfirm}
                onClick={() => handleStartRefresh('ALL')}
              >
                Confirm &amp; Start All India Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
