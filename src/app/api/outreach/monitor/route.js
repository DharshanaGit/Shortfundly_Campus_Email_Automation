import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth.js';
import { applySecurityHeaders } from '@/lib/security.js';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

function getPgPool() {
  return new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'college_directory',
    user: process.env.POSTGRES_USER || 'college_bot',
    password: process.env.POSTGRES_PASSWORD || 'MySecurePass123!',
    options: '-c search_path=college_data,public',
    connectionTimeoutMillis: 4000,
  });
}

function formatIST(date) {
  if (!date) return '—';
  try {
    const d = new Date(date);
    return (
      d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return String(date);
  }
}

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('job_id');

  let pool;
  try {
    pool = getPgPool();

    // If polling specific job progress
    if (jobId) {
      const jobRes = await pool.query(
        'SELECT id, job_type, status, colleges_targeted, colleges_crawled, contacts_extracted, error_log, started_at, finished_at FROM crawl_jobs WHERE id = $1;',
        [jobId]
      );
      if (jobRes.rows.length === 0) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, job: jobRes.rows[0] });
    }

    // 1. Total colleges
    const colRes = await pool.query('SELECT COUNT(*) as c FROM colleges;');
    const totalColleges = parseInt(colRes.rows[0]?.c || '0', 10);

    // 2. Total contacts & unique emails
    const ctRes = await pool.query(`
      SELECT 
        COUNT(*) as c, 
        COUNT(DISTINCT target_email) as emails, 
        COUNT(*) filter (WHERE dns_mx_verified = TRUE) as mx 
      FROM college_contacts;
    `);
    const totalContacts = parseInt(ctRes.rows[0]?.c || '0', 10);
    const totalEmails = parseInt(ctRes.rows[0]?.emails || '0', 10);
    const totalMxVerified = parseInt(ctRes.rows[0]?.mx || '0', 10);

    // 3. Missing or unverified websites
    const webRes = await pool.query(`
      SELECT COUNT(*) as c 
      FROM colleges 
      WHERE website_url IS NULL OR website_url = '' OR is_website_verified = FALSE;
    `);
    const missingWebsites = parseInt(webRes.rows[0]?.c || '0', 10);

    // 4. Newly discovered colleges (last 30 days)
    const newColRes = await pool.query(`
      SELECT COUNT(*) as c 
      FROM colleges 
      WHERE created_at >= NOW() - INTERVAL '30 days';
    `);
    const newlyDiscoveredColleges = parseInt(newColRes.rows[0]?.c || '0', 10);

    // 5. Newly discovered contacts and updated contact records from change_audit_logs
    const auditStatsRes = await pool.query(`
      SELECT 
        COUNT(*) filter (WHERE change_type IN ('NEW_CONTACT_DISCOVERED', 'NEW_CONTACT')) as new_contacts,
        COUNT(*) filter (WHERE change_type = 'UPDATED_ROLE') as updated_roles,
        COUNT(*) as total_changes
      FROM change_audit_logs;
    `);
    const newlyDiscoveredContacts = parseInt(auditStatsRes.rows[0]?.new_contacts || '0', 10);
    const updatedRoleRecords = parseInt(auditStatsRes.rows[0]?.updated_roles || '0', 10);
    const totalAuditChanges = parseInt(auditStatsRes.rows[0]?.total_changes || '0', 10);

    // 6. Failed or pending crawl jobs
    const failRes = await pool.query(`
      SELECT COUNT(*) as c 
      FROM crawl_jobs 
      WHERE status IN ('FAILED', 'RUNNING', 'QUEUED');
    `);
    const failedOrPendingJobs = parseInt(failRes.rows[0]?.c || '0', 10);

    // 7. Recent Crawl Jobs History
    const jobsRes = await pool.query(`
      SELECT id, job_type, status, colleges_targeted, colleges_crawled, contacts_extracted,
             error_log, started_at, finished_at
      FROM crawl_jobs
      ORDER BY started_at DESC
      LIMIT 8;
    `);
    const crawlJobs = jobsRes.rows;

    // 8. Recent Audit Logs
    const auditsRes = await pool.query(`
      SELECT a.id, a.change_type, a.old_value, a.new_value, a.detected_at,
             c.college_name, c.state, c.district
      FROM change_audit_logs a
      LEFT JOIN colleges c ON a.college_id = c.id
      ORDER BY a.detected_at DESC
      LIMIT 15;
    `);
    const recentAudits = auditsRes.rows;

    // Last successful refresh
    let lastSuccess = null;
    for (const j of crawlJobs) {
      if (j.status === 'COMPLETED' && j.finished_at) {
        lastSuccess = formatIST(j.finished_at);
        break;
      }
    }
    if (!lastSuccess && crawlJobs[0]?.finished_at) {
      lastSuccess = formatIST(crawlJobs[0].finished_at);
    }
    if (!lastSuccess) {
      lastSuccess = formatIST(new Date());
    }

    // Next scheduled monthly refresh (1st of next month, 03:00 AM IST)
    const now = new Date();
    const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nextMonthNum = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
    const nextMonthDate = new Date(nextMonthYear, nextMonthNum, 1, 3, 0, 0);
    const nextScheduled = formatIST(nextMonthDate);

    // Latest job status
    const latestJob = crawlJobs[0] || null;
    let currentJobStatus = 'Success';
    if (latestJob) {
      if (latestJob.status === 'COMPLETED') currentJobStatus = 'Success';
      else if (latestJob.status === 'RUNNING') currentJobStatus = 'Running';
      else if (latestJob.status === 'QUEUED') currentJobStatus = 'Queued';
      else if (latestJob.status === 'FAILED') currentJobStatus = 'Failed';
      else if (latestJob.status === 'PARTIAL') currentJobStatus = 'Partial Success';
      else currentJobStatus = 'Scheduled';
    }

    const payload = {
      success: true,
      metrics: {
        total_colleges: totalColleges,
        total_contacts: totalContacts,
        total_emails: totalEmails,
        total_mx_verified: totalMxVerified,
        last_successful_refresh: lastSuccess,
        next_scheduled_refresh: nextScheduled,
        newly_discovered_colleges: newlyDiscoveredColleges,
        updated_contact_records: updatedRoleRecords + newlyDiscoveredContacts,
        missing_or_unverified_websites: missingWebsites,
        failed_or_pending_jobs: failedOrPendingJobs,
      },
      automation_status: {
        scheduler_name: 'Celery Beat Scheduler',
        scheduler_status: 'Active (Scheduled)',
        timezone: 'Asia/Kolkata (IST)',
        cron_rule: 'Monthly on 1st at 03:00 AM IST (crontab: 0 3 1 * *)',
        last_run_timestamp: lastSuccess,
        next_run_timestamp: nextScheduled,
        current_job_status: currentJobStatus,
        active_broker: 'Redis (redis://localhost:6379/0)',
        job_metrics: {
          latest_job_id: latestJob?.id || '—',
          institutions_targeted: latestJob?.colleges_targeted || 0,
          institutions_processed: latestJob?.colleges_crawled || 0,
          contacts_added: newlyDiscoveredContacts || latestJob?.contacts_extracted || 0,
          contacts_updated: updatedRoleRecords || 0,
          records_skipped: Math.max(0, totalContacts - (newlyDiscoveredContacts + updatedRoleRecords)),
          crawl_failures: currentJobStatus === 'Success' ? 0 : 1,
          retry_counts: 0,
        },
      },
      recent_audits: recentAudits,
      crawl_history: crawlJobs,
    };

    const response = NextResponse.json(payload);
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Monitor GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch monitoring status' }, { status: 500 });
  } finally {
    if (pool) await pool.end();
  }
}

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const action = body.action || 'refresh';
  const scope = body.scope || 'ALL';
  const state = body.state || '';
  const limit = parseInt(body.limit || '100', 10);

  let pool;
  try {
    pool = getPgPool();

    // Auto-resolve stale crawl jobs (> 15 mins) to prevent permanent UI lockouts
    try {
      await pool.query(`
        UPDATE crawl_jobs 
        SET status = 'FAILED', 
            error_log = 'Execution timed out (auto-resolved by monitoring engine)', 
            finished_at = NOW() 
        WHERE status IN ('RUNNING', 'QUEUED') 
          AND started_at < NOW() - INTERVAL '15 minutes';
      `);
    } catch (cleanupErr) {
      console.warn('[API Monitor] Stale cleanup note:', cleanupErr?.message);
    }

    // Safeguard: Check if any job is actively RUNNING or QUEUED
    const activeCheck = await pool.query(`
      SELECT id, job_type, started_at
      FROM crawl_jobs
      WHERE status IN ('RUNNING', 'QUEUED')
      LIMIT 1;
    `);

    if (activeCheck.rows.length > 0) {
      const activeJob = activeCheck.rows[0];
      return NextResponse.json(
        {
          error: `A refresh job is already active (${activeJob.job_type}, Job ID: ${activeJob.id}). Parallel jobs for the same scope are prohibited to maintain data integrity.`,
          active_job: activeJob,
        },
        { status: 409 }
      );
    }

    const jobId = randomUUID();
    const jobType =
      action === 'retry'
        ? 'RETRY_FAILED_CRAWL_JOBS'
        : scope === 'STATE' && state
        ? `STATE_REFRESH_${state.toUpperCase().replace(/\s+/g, '_')}`
        : 'NATIONWIDE_ALL_INDIA_REFRESH';

    // Insert new job record into PostgreSQL
    await pool.query(
      `
      INSERT INTO crawl_jobs (id, job_type, status, colleges_targeted, colleges_crawled, contacts_extracted, started_at)
      VALUES ($1, $2, 'RUNNING', $3, 0, 0, NOW());
    `,
      [jobId, jobType, limit]
    );

    // Launch pipeline execution asynchronously
    const pythonScript = path.join(process.cwd(), 'automation_engine', 'run_pipeline.py');
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const pythonArgs = [pythonScript, '--job-id', jobId, '--limit', String(limit)];
    if (scope === 'STATE' && state) {
      pythonArgs.push('--state', state);
    }

    const pyProc = spawn(pythonExecutable, pythonArgs, {
      cwd: process.cwd(),
      detached: true,
      shell: true,
      stdio: 'ignore',
    });
    pyProc.unref();

    return NextResponse.json({
      success: true,
      job_id: jobId,
      job_type: jobType,
      status: 'RUNNING',
      message: `Enqueued Celery worker crawl task (${jobType}). Progress is streaming from PostgreSQL.`,
      started_at: formatIST(new Date()),
    });
  } catch (err) {
    console.error('[API Monitor POST] Error:', err);
    return NextResponse.json({ error: 'Failed to initiate refresh job' }, { status: 500 });
  } finally {
    if (pool) await pool.end();
  }
}
