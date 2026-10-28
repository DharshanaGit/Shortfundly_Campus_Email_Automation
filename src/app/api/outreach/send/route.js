import { NextResponse } from 'next/server';
import { getSession, canSendOutreach } from '@/lib/auth.js';
import { checkDuplicateOutreach, logAuditEvent } from '@/lib/db.js';
import { queueOutreachJob, processOutreachJob } from '@/lib/worker.js';
import {
  outreachSendSchema,
  validateCsrfOrigin,
  checkSendRateLimit,
  recordSendAction,
  applySecurityHeaders,
} from '@/lib/security.js';

export async function POST(request) {
  // 1. Session authorization check
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized access.' }, { status: 401 });
  }

  // 1b. Role-based sending authorization check
  if (!canSendOutreach(session)) {
    return NextResponse.json(
      { success: false, error: 'Access denied: Your account is restricted to read-only access. An Administrator must enable sending permissions.' },
      { status: 403 }
    );
  }

  // 2. CSRF Origin check
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ success: false, error: 'CSRF security validation failed.' }, { status: 403 });
  }

  // 3. Sending rate limit check
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const rateLimitKey = `${session.userId}:${ip}`;
  const rateCheck = checkSendRateLimit(rateLimitKey);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Sending rate limit exceeded. Please wait ${rateCheck.retryAfterSec} seconds before sending more emails.`,
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parse = outreachSendSchema.safeParse(body);

    if (!parse.success) {
      return NextResponse.json(
        { success: false, error: parse.error.errors[0]?.message || 'Validation error.' },
        { status: 400 }
      );
    }

    const data = parse.data;
    if (!data.campaign_id) {
      data.campaign_id = 'SINGLE_DISPATCH';
    }

    // 4. Atomic duplicate prevention check
    const duplicateCheck = checkDuplicateOutreach(data.email);
    if (duplicateCheck.isDuplicate && !data.override_duplicate) {
      logAuditEvent('OUTREACH_DUPLICATE_BLOCKED', {
        email: data.email,
        college: data.college_name,
        lastRecord: duplicateCheck.lastRecord,
      }, session.email, ip);

      return NextResponse.json(
        {
          success: false,
          isDuplicate: true,
          duplicateDetails: duplicateCheck,
          error: duplicateCheck.message,
        },
        { status: 409 }
      );
    }

    if (duplicateCheck.isDuplicate && data.override_duplicate) {
      logAuditEvent('OUTREACH_DUPLICATE_OVERRIDDEN', {
        email: data.email,
        college: data.college_name,
        reason: data.override_reason || 'No reason provided',
      }, session.email, ip);
    }

    // Record rate limit expenditure
    recordSendAction(rateLimitKey);

    // 5. Save outreach record first in PENDING status
    const outreachId = queueOutreachJob(data, session.email);

    // 6. Worker claims job -> PROCESSING -> dispatches through Nodemailer Google SMTP
    const workerResult = await processOutreachJob(outreachId, session.email);

    const response = NextResponse.json({
      success: workerResult.success,
      outreachId,
      status: workerResult.status,
      messageId: workerResult.messageId || null,
      response: workerResult.response || null,
      error: workerResult.error || null,
      classification: workerResult.classification || null,
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Send] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process outreach email request.' },
      { status: 500 }
    );
  }
}
