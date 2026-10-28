import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth.js';
import { getDb } from '@/lib/db.js';

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  try {
    const records = db.prepare(`
      SELECT 
        college_name, email, department, contact_person, designation,
        subject, status, delivery_status, error_message, smtp_response,
        smtp_message_id, attempts, sent_by, created_at, sent_at,
        open_count, click_count, first_opened_at, last_opened_at, state, country
      FROM outreach_logs
      WHERE campaign_id IS NULL OR campaign_id = '' OR campaign_id = 'SINGLE_DISPATCH'
      ORDER BY created_at DESC
      LIMIT 2000
    `).all();

    const headers = [
      'College Name',
      'Recipient Email',
      'Contact Person',
      'Designation',
      'Department',
      'Subject',
      'Status',
      'Delivery Status',
      'Attempts',
      'Sent At (UTC)',
      'Opens Count',
      'Clicks Count',
      'First Opened At',
      'SMTP Message ID',
      'SMTP Server Response',
      'Error Reason',
      'State',
      'Country',
      'Dispatched By'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvRows = [headers.join(',')];
    for (const r of records) {
      csvRows.push([
        escapeCsv(r.college_name),
        escapeCsv(r.email),
        escapeCsv(r.contact_person),
        escapeCsv(r.designation),
        escapeCsv(r.department),
        escapeCsv(r.subject),
        escapeCsv(r.status),
        escapeCsv(r.delivery_status),
        escapeCsv(r.attempts),
        escapeCsv(r.sent_at || r.created_at),
        escapeCsv(r.open_count || 0),
        escapeCsv(r.click_count || 0),
        escapeCsv(r.first_opened_at || ''),
        escapeCsv(r.smtp_message_id || ''),
        escapeCsv(r.smtp_response || ''),
        escapeCsv(r.error_message || ''),
        escapeCsv(r.state || ''),
        escapeCsv(r.country || ''),
        escapeCsv(r.sent_by || '')
      ].join(','));
    }

    const csvContent = csvRows.join('\r\n');
    const filename = `Single_Dispatcher_Outreach_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[API Single Dispatches Export] Error:', err);
    return NextResponse.json({ error: 'Failed to export CSV report.' }, { status: 500 });
  }
}
