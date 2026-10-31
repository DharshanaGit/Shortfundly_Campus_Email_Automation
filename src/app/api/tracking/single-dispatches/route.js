import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth.js';
import { getDb, logAuditEvent } from '@/lib/db.js';
import { processOutreachJob } from '@/lib/worker.js';
import { applySecurityHeaders, validateCsrfOrigin } from '@/lib/security.js';

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;

  const db = getDb();

  try {
    // 1. Compute summary KPIs for Single Dispatcher Mails (campaign_id IS NULL OR campaign_id = '')
    const summaryRow = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ACCEPTED' OR delivery_status = 'SMTP_ACCEPTED' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN open_count > 0 THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN click_count > 0 THEN 1 ELSE 0 END) as clicked,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM outreach_logs
      WHERE campaign_id IS NULL OR campaign_id = '' OR campaign_id = 'SINGLE_DISPATCH'
    `).get() || {};

    const summary = {
      total: summaryRow.total || 0,
      accepted: summaryRow.accepted || 0,
      opened: summaryRow.opened || 0,
      clicked: summaryRow.clicked || 0,
      failed: summaryRow.failed || 0,
    };

    // 2. Build filtered query for individual recipient records
    let whereClause = 'WHERE (campaign_id IS NULL OR campaign_id = \'\' OR campaign_id = \'SINGLE_DISPATCH\')';
    const params = [];

    if (status !== 'all') {
      if (status === 'OPENED') {
        whereClause += ' AND open_count > 0';
      } else if (status === 'CLICKED') {
        whereClause += ' AND click_count > 0';
      } else {
        whereClause += ' AND status = ?';
        params.push(status);
      }
    }

    if (query.trim()) {
      const wild = `%${query.trim()}%`;
      whereClause += ' AND (college_name LIKE ? OR email LIKE ? OR contact_person LIKE ? OR department LIKE ? OR subject LIKE ?)';
      params.push(wild, wild, wild, wild, wild);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM outreach_logs ${whereClause}`).get(...params);
    const totalFiltered = countRow ? countRow.count : 0;

    const recordsQuery = `
      SELECT 
        id, college_name, email, normalized_email, department,
        contact_person, designation, subject, body_html, body_text,
        status, delivery_status, error_message, smtp_response, smtp_message_id,
        attempts, sent_by, created_at, sent_at, last_attempt_at,
        open_count, click_count, first_opened_at, last_opened_at,
        country, state, attachments
      FROM outreach_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const records = db.prepare(recordsQuery).all(...params, limit, offset);

    const response = NextResponse.json({
      success: true,
      summary,
      total: totalFiltered,
      page,
      limit,
      totalPages: Math.ceil(totalFiltered / limit),
      records,
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Single Dispatches GET] Error:', err);
    return NextResponse.json({ error: 'Failed to retrieve single dispatch tracking logs.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action, id } = body;

    if (action === 'retry') {
      if (!id) {
        return NextResponse.json({ error: 'Outreach record ID is required for retry.' }, { status: 400 });
      }

      const db = getDb();
      const existing = db.prepare('SELECT id, email, college_name, status FROM outreach_logs WHERE id = ?').get(id);
      if (!existing) {
        return NextResponse.json({ error: 'Outreach record not found.' }, { status: 404 });
      }

      // Re-trigger dispatch job
      const result = await processOutreachJob(id, session.email);

      logAuditEvent('SINGLE_DISPATCH_RETRIED', { id, email: existing.email, college: existing.college_name, result }, session.email);

      const response = NextResponse.json({
        success: result.success,
        status: result.status,
        message: result.success ? `Email successfully re-dispatched to ${existing.email}!` : (result.error || 'Retry attempt failed.'),
      });

      applySecurityHeaders(response.headers);
      return response;
    }

    return NextResponse.json({ error: 'Invalid action requested.' }, { status: 400 });
  } catch (err) {
    console.error('[API Single Dispatches POST] Error:', err);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { id, clearAll } = body;
    const db = getDb();

    if (clearAll) {
      db.prepare("DELETE FROM outreach_logs WHERE campaign_id IS NULL OR campaign_id = '' OR campaign_id = 'SINGLE_DISPATCH'").run();
      logAuditEvent('ALL_SINGLE_DISPATCHES_CLEARED', {}, session.email);
      const response = NextResponse.json({ success: true, message: 'All single mail tracking records cleared successfully.' });
      applySecurityHeaders(response.headers);
      return response;
    }

    if (id) {
      db.prepare('DELETE FROM outreach_logs WHERE id = ?').run(id);
      logAuditEvent('SINGLE_DISPATCH_DELETED', { id }, session.email);
      const response = NextResponse.json({ success: true, message: 'Record deleted.' });
      applySecurityHeaders(response.headers);
      return response;
    }

    return NextResponse.json({ error: 'ID or clearAll required.' }, { status: 400 });
  } catch (err) {
    console.error('[API Single Dispatches DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete record.' }, { status: 500 });
  }
}

