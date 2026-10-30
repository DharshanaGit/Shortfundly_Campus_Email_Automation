import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, logAuditEvent, getEffectiveSmtpSettings, getSystemSetting, updateCampaignCounters } from './db.js';
import { getMailerTransporter, classifySmtpError, formatSmtpErrorMessage } from './mailer.js';
import { wrapInEmailLayout } from './templates.js';
import { config } from './config.js';

/**
 * Converts rich HTML into clean, well-spaced plain text fallback
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '  • ')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Creates and queues a new outreach record in PENDING state atomically
 */
export function queueOutreachJob(data, userEmail) {
  const db = getDb();
  const id = data.id || 'out_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const trackingToken = data.tracking_token || crypto.randomBytes(16).toString('hex');
  const serializedAttachments = Array.isArray(data.attachments)
    ? JSON.stringify(data.attachments)
    : typeof data.attachments === 'string'
    ? data.attachments
    : '[]';

  // Generate structured plain text for optimal deliverability and accessibility
  const plainText = data.body_text || htmlToPlainText(data.body_html);

  db.prepare(`
    INSERT INTO outreach_logs (
      id, college_name, email, normalized_email, department,
      contact_person, designation, subject, body_html, body_text,
      status, failure_type, attempts, sent_by, created_at,
      override_duplicate, override_reason, campaign_id, country, state, tracking_token, attachments
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      'PENDING', 'NONE', 0, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    data.college_name,
    data.email,
    data.email.trim().toLowerCase(),
    data.department || 'Campus Partnerships',
    data.contact_person || null,
    data.designation || null,
    data.subject,
    data.body_html,
    plainText,
    userEmail,
    now,
    data.override_duplicate ? 1 : 0,
    data.override_reason || null,
    data.campaign_id || null,
    data.country || 'India',
    data.state || 'Andhra Pradesh',
    trackingToken,
    serializedAttachments
  );

  logAuditEvent('OUTREACH_QUEUED', { id, email: data.email, college: data.college_name, campaignId: data.campaign_id }, userEmail);

  return id;
}

/**
 * Prepares HTML content with image handling (CID attachments + hosted absolute URLs)
 * and optional tracking injection (open pixel + click redirects).
 */
function prepareEmailContent(job) {
  let html = job.body_html || '';
  const attachments = [];
  const appUrl = (getSystemSetting('app_url', config.APP_URL) || 'http://localhost:3000').replace(/\/+$/, '');
  const trackingToken = job.tracking_token;

  // 1. Process inline image tags: if any image tags are present, strip them from HTML content and attach them as regular email file attachments
  const projectRoot = process.cwd();
  let imgIndex = 0;

  // 1a. Convert base64 data URI images into regular file attachments
  const dataUriRegex = /<img\s+([^>]*?)src=["']data:image\/([a-zA-Z0-9+]+);base64,([^"']+)["']([^>]*?)>/gi;
  html = html.replace(dataUriRegex, (match, pre, imageType, base64Data) => {
    const ext = imageType.toLowerCase().replace('+xml', '');
    const safeExt = ext === 'jpeg' ? 'jpg' : ext;
    imgIndex++;
    attachments.push({
      filename: `institutional_flyer_${imgIndex}.${safeExt}`,
      content: base64Data,
      encoding: 'base64',
      contentType: `image/${imageType}`,
    });
    return ''; // Remove image from email HTML body
  });

  // 1b. Convert relative file path images to regular file attachments
  const imageRegex = /<img\s+([^>]*?)src=["'](\/[^"']+)["']([^>]*?)>/gi;
  html = html.replace(imageRegex, (match, pre, srcPath) => {
    const localFilePath = path.join(projectRoot, 'public', srcPath.replace(/^\//, ''));
    const tmpFilePath1 = path.join(os.tmpdir(), 'shortfundly_images', path.basename(srcPath));
    const tmpFilePath2 = path.join(os.tmpdir(), 'shortfundly_attachments', path.basename(srcPath));
    
    let resolvedPath = null;
    if (fs.existsSync(localFilePath)) {
      resolvedPath = localFilePath;
    } else if (fs.existsSync(tmpFilePath1)) {
      resolvedPath = tmpFilePath1;
    } else if (fs.existsSync(tmpFilePath2)) {
      resolvedPath = tmpFilePath2;
    }

    if (resolvedPath) {
      const filename = path.basename(resolvedPath);
      attachments.push({
        filename,
        path: resolvedPath,
      });
    }
    return ''; // Remove image from email HTML body
  });

  // 2. Click tracking: rewrite links if tracking enabled
  const trackClicks = getSystemSetting('track_clicks_default', '1') === '1';
  if (trackClicks && trackingToken) {
    const linkRegex = /<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']([^>]*?)>/gi;
    html = html.replace(linkRegex, (match, pre, targetUrl, post) => {
      // Skip tracking links that are already tracking URLs
      if (targetUrl.includes('/api/tracking/')) return match;
      const redirectUrl = `${appUrl}/api/tracking/click/${trackingToken}?url=${encodeURIComponent(targetUrl)}`;
      return `<a ${pre}href="${redirectUrl}" ${post}>`;
    });
  }

  // 3. Wrap in consistent layout
  let finalHtml = wrapInEmailLayout(html, {
    unsubscribeUrl: `mailto:${config.FROM_EMAIL}?subject=Unsubscribe%20${encodeURIComponent(job.email)}`
  });

  // 4. Open tracking pixel: inject before </body> ONLY if using secure public HTTPS
  const trackOpens = getSystemSetting('track_opens_default', '1') === '1';
  if (trackOpens && trackingToken && appUrl.startsWith('https://')) {
    const pixelUrl = `${appUrl}/api/tracking/open/${trackingToken}`;
    const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:none;outline:none;" />`;
    if (finalHtml.includes('</body>')) {
      finalHtml = finalHtml.replace('</body>', `${pixelTag}</body>`);
    } else {
      finalHtml += pixelTag;
    }
  }

  // 5. Process downloadable file attachments (separate from CID inline images)
  let fileAttachments = [];
  try {
    if (job.attachments) {
      fileAttachments = typeof job.attachments === 'string' ? JSON.parse(job.attachments) : job.attachments;
    }
  } catch {
    fileAttachments = [];
  }

  if (Array.isArray(fileAttachments) && fileAttachments.length > 0) {
    const allowedItems = fileAttachments.slice(0, 5);
    let totalSize = 0;
    const MAX_COMBINED_SIZE = 20 * 1024 * 1024; // 20 MB

    for (const item of allowedItems) {
      if (!item) continue;

      if (item.content) {
        // Direct Base64 / in-memory payload (resilient across serverless environments)
        attachments.push({
          filename: item.filename || 'attachment',
          content: item.content,
          encoding: item.encoding || 'base64',
          contentType: item.mimeType || undefined,
        });
      } else if (item.url && item.url.startsWith('data:')) {
        const matches = item.url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          attachments.push({
            filename: item.filename || 'attachment',
            content: matches[2],
            encoding: 'base64',
            contentType: item.mimeType || matches[1],
          });
        }
      } else {
        let filePath = item.path;
        if (!filePath && item.url && !item.url.startsWith('http')) {
          filePath = path.join(projectRoot, 'public', item.url.replace(/^\//, ''));
        }
        if (!filePath || !fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
          const tmp1 = path.join(os.tmpdir(), 'shortfundly_attachments', path.basename(item.savedName || item.filename || ''));
          const tmp2 = path.join(os.tmpdir(), 'shortfundly_images', path.basename(item.savedName || item.filename || ''));
          if (fs.existsSync(tmp1)) filePath = tmp1;
          else if (fs.existsSync(tmp2)) filePath = tmp2;
        }
        if (filePath && fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
          const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
          if (totalSize + stat.size <= MAX_COMBINED_SIZE) {
            totalSize += stat.size;
            attachments.push({
              filename: item.filename || path.basename(filePath),
              path: filePath,
              contentType: item.mimeType || undefined,
            });
          }
        }
      }
    }
  }

  return { html: finalHtml, attachments };
}

/**
 * Worker execution unit: claims a PENDING or retryable job and dispatches
 */
export async function processOutreachJob(outreachId, userEmail = 'system') {
  const db = getDb();

  // 1. Atomically claim the job by changing status to PROCESSING
  const claimStmt = db.prepare(`
    UPDATE outreach_logs
    SET status = 'PROCESSING',
        attempts = attempts + 1,
        last_attempt_at = ?
    WHERE id = ? AND status IN ('PENDING', 'FAILED')
  `);

  const now = new Date().toISOString();
  const result = claimStmt.run(now, outreachId);

  if (result.changes === 0) {
    return { success: false, message: 'Job already in progress or completed.' };
  }

  // 2. Fetch the claimed record
  const job = db.prepare('SELECT * FROM outreach_logs WHERE id = ?').get(outreachId);
  if (!job) {
    return { success: false, message: 'Job not found after claim.' };
  }

  try {
    const smtp = getEffectiveSmtpSettings();

    // Check if SMTP is turned off in Settings
    if (smtp.smtp_enabled === false) {
      const cleanErrorMessage = 'SMTP sending is currently turned OFF in Settings. Enable SMTP in Settings to send live emails.';
      db.prepare(`
        UPDATE outreach_logs
        SET status = 'FAILED',
            failure_type = 'SMTP_DISABLED',
            error_message = ?,
            delivery_status = 'FAILED'
        WHERE id = ?
      `).run(cleanErrorMessage, outreachId);

      logAuditEvent('OUTREACH_FAILED_SMTP_OFF', { id: outreachId, email: job.email, reason: cleanErrorMessage }, userEmail);
      if (job.campaign_id) updateCampaignCounters(job.campaign_id);

      return {
        success: false,
        status: 'FAILED',
        error: cleanErrorMessage,
      };
    }

    // Check if Simulation Mode is active (safe testing mode without sending real emails)
    if (smtp.simulation_mode === true) {
      const simulatedMsgId = `<simulated_${Date.now()}_${crypto.randomBytes(6).toString('hex')}@simulation.local>`;
      const simulatedResponse = '250 OK Message Simulated (Test Mode Active - No real email dispatched)';
      const sentAt = new Date().toISOString();

      db.prepare(`
        UPDATE outreach_logs
        SET status = 'ACCEPTED',
            failure_type = 'NONE',
            error_message = NULL,
            smtp_response = ?,
            smtp_message_id = ?,
            sent_at = ?,
            delivery_status = 'SMTP_ACCEPTED'
        WHERE id = ?
      `).run(simulatedResponse, simulatedMsgId, sentAt, outreachId);

      logAuditEvent('OUTREACH_SIMULATED', {
        id: outreachId,
        email: job.email,
        messageId: simulatedMsgId,
        simulation: true
      }, userEmail);

      if (job.campaign_id) updateCampaignCounters(job.campaign_id);

      return {
        success: true,
        status: 'ACCEPTED',
        messageId: simulatedMsgId,
        response: simulatedResponse,
        simulation: true,
      };
    }

    const transporter = getMailerTransporter();
    const fromName = smtp.from_name || config.FROM_NAME || 'Campus Outreach Coordinator';

    const smtpUser = (smtp.user || '').trim();
    const isGmailUser = smtpUser.toLowerCase().endsWith('@gmail.com') || smtpUser.toLowerCase().endsWith('@googlemail.com');

    // SPF & DMARC alignment: For Gmail SMTP, From and Reply-To must align with authenticated sender address
    const effectiveFromEmail = isGmailUser ? smtpUser : (smtp.from_email || config.FROM_EMAIL || smtpUser);
    const effectiveReplyTo = isGmailUser ? effectiveFromEmail : (smtp.reply_to || smtp.from_email || config.FROM_EMAIL || effectiveFromEmail).trim();

    const plainText = job.body_text || htmlToPlainText(job.body_html);

    // Generate standard RFC-compliant Message-ID and headers
    const domain = isGmailUser ? 'gmail.com' : (effectiveFromEmail.split('@')[1] || 'outreach.org');
    const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;

    const mailOptions = {
      from: `"${fromName}" <${effectiveFromEmail}>`,
      to: job.email,
      replyTo: `"${fromName}" <${effectiveReplyTo}>`,
      subject: job.subject,
      text: plainText,
      html: fullHtml,
      headers: {
        'Message-ID': messageId,
        'Date': new Date().toUTCString(),
        'MIME-Version': '1.0',
        'X-Priority': '3',
        'Importance': 'Normal',
        'X-Entity-Ref-ID': outreachId,
      },
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    const sentAt = new Date().toISOString();

    // 3. Mark as ACCEPTED upon 250 response receipt (SMTP accepted relay)
    db.prepare(`
      UPDATE outreach_logs
      SET status = 'ACCEPTED',
          failure_type = 'NONE',
          error_message = NULL,
          smtp_response = ?,
          smtp_message_id = ?,
          sent_at = ?,
          delivery_status = 'SMTP_ACCEPTED'
      WHERE id = ?
    `).run(info.response || '250 OK Message Accepted', info.messageId || null, sentAt, outreachId);

    logAuditEvent('OUTREACH_ACCEPTED', {
      id: outreachId,
      email: job.email,
      messageId: info.messageId,
      attempts: job.attempts + 1
    }, userEmail);

    if (job.campaign_id) {
      updateCampaignCounters(job.campaign_id);
    }

    return {
      success: true,
      status: 'ACCEPTED',
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    const classification = classifySmtpError(error);
    const finalStatus = classification.type === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED';
    const cleanErrorMessage = formatSmtpErrorMessage(error);

    db.prepare(`
      UPDATE outreach_logs
      SET status = ?,
          failure_type = ?,
          error_message = ?,
          smtp_response = ?,
          delivery_status = 'FAILED'
      WHERE id = ?
    `).run(
      finalStatus,
      classification.type,
      cleanErrorMessage,
      error.response || null,
      outreachId
    );

    logAuditEvent('OUTREACH_FAILED', {
      id: outreachId,
      email: job.email,
      classification,
      error: cleanErrorMessage
    }, userEmail);

    if (job.campaign_id) {
      updateCampaignCounters(job.campaign_id);
    }

    return {
      success: false,
      status: finalStatus,
      classification,
      error: cleanErrorMessage,
    };
  }
}
