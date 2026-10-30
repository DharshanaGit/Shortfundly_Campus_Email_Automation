import { NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth.js';
import { getEffectiveSmtpSettings, setSystemSetting, logAuditEvent } from '@/lib/db.js';
import { resetMailerTransporter } from '@/lib/mailer.js';
import { applySecurityHeaders, validateCsrfOrigin } from '@/lib/security.js';

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only Admin can view SMTP configuration
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Access denied: Administrator privileges required.' }, { status: 403 });
  }

  const smtp = getEffectiveSmtpSettings();
  let user = smtp.user;
  if (!user || user.toLowerCase().includes('campus@shortfundly')) {
    user = 'dharshana.shortfundly@gmail.com';
  }

  // Return masked representation — NEVER expose the secret password!
  const safeData = {
    host: smtp.host || 'smtp.gmail.com',
    port: smtp.port || 465,
    secure: smtp.secure !== false,
    user: user,
    from_email: smtp.from_email || 'campus@shortfundly.com',
    from_name: smtp.from_name || 'Campus Outreach Coordinator',
    auth_method: smtp.auth_method || 'app_password',
    smtp_enabled: smtp.smtp_enabled !== false,
    simulation_mode: Boolean(smtp.simulation_mode),
    is_configured: Boolean(user && smtp.pass),
    pass_masked: smtp.pass ? '••••••••••••••••' : '',
  };

  const response = NextResponse.json(safeData);
  applySecurityHeaders(response.headers);
  return response;
}

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only Admin can modify SMTP configuration
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Access denied: Administrator privileges required.' }, { status: 403 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { host, port, secure, user, pass, from_email, from_name, auth_method, smtp_enabled, simulation_mode } = body;

    let targetUser = (user || '').trim();
    if (!targetUser || targetUser.toLowerCase().includes('campus@shortfundly')) {
      targetUser = 'dharshana.shortfundly@gmail.com';
    }

    const currentSmtp = getEffectiveSmtpSettings();

    // Preserve existing password if bullets or empty submitted
    let finalPass = currentSmtp.pass;
    if (pass && !pass.includes('•') && pass.trim().length > 0) {
      finalPass = pass.trim();
    }

    setSystemSetting('smtp_host', (host || 'smtp.gmail.com').trim(), session.email);
    setSystemSetting('smtp_port', String(port || 465).trim(), session.email);
    setSystemSetting('smtp_secure', secure ? '1' : '0', session.email);
    setSystemSetting('smtp_user', targetUser, session.email);
    if (finalPass) {
      setSystemSetting('smtp_pass', finalPass, session.email);
    }
    setSystemSetting('from_email', (from_email || 'campus@shortfundly.com').trim(), session.email);
    setSystemSetting('from_name', (from_name || 'Campus Outreach Coordinator').trim(), session.email);
    setSystemSetting('smtp_auth_method', (auth_method || 'app_password').trim(), session.email);
    if (smtp_enabled !== undefined) {
      setSystemSetting('smtp_enabled', smtp_enabled ? '1' : '0', session.email);
    }
    if (simulation_mode !== undefined) {
      setSystemSetting('simulation_mode', simulation_mode ? '1' : '0', session.email);
    }

    // Reset cached transporter so changes take immediate effect
    resetMailerTransporter();

    logAuditEvent('SMTP_CONFIG_UPDATED', {
      user: targetUser,
      host: host || 'smtp.gmail.com',
      port: port || 465,
    }, session.email);

    const response = NextResponse.json({
      success: true,
      message: 'Google SMTP settings saved securely.',
    });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Admin SMTP POST] Error:', err);
    return NextResponse.json({ error: 'Failed to update SMTP settings.' }, { status: 500 });
  }
}
