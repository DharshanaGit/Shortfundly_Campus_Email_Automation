import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, COOKIE_NAME } from '@/lib/auth.js';
import { getDb, logAuditEvent } from '@/lib/db.js';
import { config, normalizeEmail } from '@/lib/config.js';
import { applySecurityHeaders, verifyCaptcha, validateCsrfOrigin } from '@/lib/security.js';

export async function POST(request) {
  try {
    if (!validateCsrfOrigin(request)) {
      return NextResponse.json({ success: false, error: 'CSRF security validation failed.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { email, password, confirm_password, captcha_token, captcha_answer } = body;

    // 1. Verify cryptographic CAPTCHA challenge
    const captchaToken = captcha_token || request.cookies.get('sf_captcha_token')?.value;
    const isCaptchaValid = verifyCaptcha(captchaToken, captcha_answer);
    if (!isCaptchaValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Security verification failed: Incorrect or expired CAPTCHA code. Please enter the characters shown.',
        },
        { status: 400 }
      );
    }

    // 2. Strict Email Validation: Numbers allowed, NO capital letters allowed, must end with @gmail.com
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email address is required.' },
        { status: 400 }
      );
    }

    const rawEmail = email.trim();

    // Check for capital letters (strict rule: NO caps allowed)
    if (/[A-Z]/.test(rawEmail)) {
      return NextResponse.json(
        { success: false, error: 'Capital letters are not allowed in email. Use only lowercase letters and numbers.' },
        { status: 400 }
      );
    }

    // Check for disallowed characters (only lowercase, digits, @, ., _, - allowed)
    if (/[^a-z0-9@._-]/.test(rawEmail)) {
      return NextResponse.json(
        { success: false, error: 'Special characters and spaces are not allowed in email.' },
        { status: 400 }
      );
    }

    // Must end with @gmail.com
    if (!rawEmail.endsWith('@gmail.com')) {
      return NextResponse.json(
        { success: false, error: 'Email must end with @gmail.com' },
        { status: 400 }
      );
    }

    // Prefix validation (letters and numbers allowed)
    const prefix = rawEmail.slice(0, -10);
    if (!prefix || !/^[a-z0-9._-]+$/.test(prefix)) {
      return NextResponse.json(
        { success: false, error: 'Email prefix must contain only lowercase letters and numbers.' },
        { status: 400 }
      );
    }

    // 3. Password Validation
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    if (confirm_password !== undefined && password !== confirm_password) {
      return NextResponse.json(
        { success: false, error: 'Passwords do not match. Please ensure both passwords are identical.' },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(rawEmail);
    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database service is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // 4. Check for duplicate account
    let existing = null;
    try {
      existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
    } catch (dbErr) {
      console.warn('[Register] Error checking existing user:', dbErr?.message);
    }

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'An account with this email address already exists. Please sign in instead.',
        },
        { status: 409 }
      );
    }

    // 5. Create new user record with full administrator privileges (zero restrictions)
    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const passwordHash = bcrypt.hashSync(password.trim(), 10);
    const now = new Date().toISOString();
    const role = 'admin'; // Full unrestricted administrative access for all features
    const canSendVal = 1;

    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, is_active, can_send, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(userId, normalized, passwordHash, role, canSendVal, now);
    } catch (insertErr) {
      console.error('[Register] Database insert error:', insertErr);
      return NextResponse.json(
        { success: false, error: 'Failed to create user account. Please try again.' },
        { status: 500 }
      );
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    try {
      logAuditEvent('USER_REGISTERED', `New account created: ${normalized} (Role: ${role})`, normalized, ip);
    } catch {}

    const newUser = {
      id: userId,
      email: normalized,
      role,
      is_active: 1,
      can_send: canSendVal,
    };

    // 6. User account is securely stored in database. Return success for user to proceed to login.
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: normalized,
        role,
        can_send: Boolean(canSendVal),
      },
      message: 'Your account has been successfully created! Proceed to login.',
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Register] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err?.message ? `Registration error: ${err.message}` : 'Internal server error.' },
      { status: 500 }
    );
  }
}
