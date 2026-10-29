import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';

// In-memory rate limiter for outreach sending (User / IP based)
const sendRateLimitMap = new Map();

/**
 * Generates an SVG CAPTCHA with cryptographic HMAC token (no server session needed)
 */
export function generateCaptchaChallenge() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let text = '';
  for (let i = 0; i < 5; i++) {
    text += chars[Math.floor(Math.random() * chars.length)];
  }

  const timestamp = Date.now();
  const hmac = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(`${timestamp}:${text.toLowerCase()}`)
    .digest('hex');

  const token = `${timestamp}.${hmac}`;

  const width = 160;
  const height = 44;
  const colors = ['#e11d48', '#be123c', '#0f172a', '#2563eb', '#059669'];

  let linesSvg = '';
  for (let i = 0; i < 4; i++) {
    const y1 = Math.floor(Math.random() * height);
    const y2 = Math.floor(Math.random() * height);
    const stroke = colors[i % colors.length];
    linesSvg += `<line x1="0" y1="${y1}" x2="${width}" y2="${y2}" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.3" />`;
  }

  let textSvg = '';
  for (let i = 0; i < text.length; i++) {
    const x = 18 + i * 26 + (Math.random() * 4 - 2);
    const y = 30 + (Math.random() * 4 - 2);
    const rot = Math.floor(Math.random() * 20) - 10;
    const color = colors[i % colors.length];
    textSvg += `<text x="${x}" y="${y}" font-family="monospace, sans-serif" font-size="22" font-weight="700" fill="${color}" transform="rotate(${rot}, ${x}, ${y})">${text[i]}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#f8fafc;border-radius:6px;border:1px solid #cbd5e1;user-select:none;">${linesSvg}${textSvg}</svg>`;

  return { svg, token };
}

/**
 * Validates user's answer against signed CAPTCHA token with 5-minute TTL
 */
export function verifyCaptcha(token, answer) {
  if (!token || !answer || typeof token !== 'string' || typeof answer !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, expectedHmac] = parts;
  const timestamp = Number(timestampStr);
  if (isNaN(timestamp)) return false;

  // 5-minute validity window
  const now = Date.now();
  if (now - timestamp > 300000 || now < timestamp - 5000) {
    return false;
  }

  const computedHmac = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(`${timestamp}:${answer.trim().toLowerCase()}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Checks and updates rate limiting for outreach send/retry operations
 */
export function checkSendRateLimit(identifier) {
  const now = Date.now();
  const entry = sendRateLimitMap.get(identifier);

  if (!entry) {
    return { allowed: true, remaining: config.RATE_LIMIT_SEND_MAX };
  }

  // Reset window if expired
  if (now - entry.windowStart > config.RATE_LIMIT_SEND_WINDOW_SEC * 1000) {
    sendRateLimitMap.delete(identifier);
    return { allowed: true, remaining: config.RATE_LIMIT_SEND_MAX };
  }

  if (entry.count >= config.RATE_LIMIT_SEND_MAX) {
    const retryAfterSec = Math.ceil((entry.windowStart + config.RATE_LIMIT_SEND_WINDOW_SEC * 1000 - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: config.RATE_LIMIT_SEND_MAX - entry.count };
}

export function recordSendAction(identifier) {
  const now = Date.now();
  const entry = sendRateLimitMap.get(identifier);
  if (!entry || (now - entry.windowStart > config.RATE_LIMIT_SEND_WINDOW_SEC * 1000)) {
    sendRateLimitMap.set(identifier, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

/**
 * Zod schemas for runtime request validation
 */
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid company email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  captcha_token: z.string().optional().nullable(),
  captcha_answer: z.string().min(1, 'Please enter the CAPTCHA security code.'),
});

export const outreachSendSchema = z.object({
  college_name: z.string().min(2, 'College name must be at least 2 characters.').max(150),
  email: z.string().email('Please enter a valid recipient college email address.'),
  department: z.string().min(2, 'Department name is required.').max(100),
  contact_person: z.string().max(100).optional().nullable(),
  designation: z.string().max(100).optional().nullable(),
  subject: z.string().min(5, 'Subject is required.').max(250),
  body_html: z.string().min(20, 'Email body content is too short.'),
  override_duplicate: z.boolean().optional().default(false),
  override_reason: z.string().max(300).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  campaign_id: z.string().max(100).optional().nullable(),
  attachments: z.array(z.object({
    filename: z.string(),
    savedName: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    publicUrl: z.string().optional().nullable(),
    path: z.string().optional().nullable(),
    mimeType: z.string().optional().nullable(),
    size: z.number().optional().nullable(),
    isImage: z.boolean().optional().nullable(),
    content: z.string().optional().nullable(),
    encoding: z.string().optional().nullable(),
    cid: z.string().optional().nullable(),
  }).passthrough()).max(10, 'Maximum of 10 attachments allowed.').optional().default([]),
});

export const checkDuplicateSchema = z.object({
  email: z.string().email('Invalid email address for duplicate check.'),
});

export const retrySchema = z.object({
  id: z.string().min(5, 'Invalid outreach log ID.'),
});

/**
 * Validates CSRF origin for state-mutating API calls
 */
export function validateCsrfOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    // In local development or server-to-server, origin might be absent; allow if same host
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * Applies OWASP security headers to responses
 */
export function applySecurityHeaders(headers = new Headers()) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
  );
  return headers;
}
