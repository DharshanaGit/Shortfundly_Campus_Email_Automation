import { escapeHtml } from './config.js';

export const DEFAULT_TEMPLATES = [
  {
    id: 'campus-collaboration-proposal',
    title: 'Institutional Campus Collaboration Proposal (Official)',
    subjectTemplate: 'Proposal for Institutional Collaboration — Academic & Skill Development at {{college_name}}',
    bodyTemplate: `<p>Dear {{contact_salutation}},</p>

<p>Greetings from Campus Outreach Initiative!</p>

<p>We are writing to propose an official institutional collaboration with <strong>{{college_name}}</strong>{{department_clause}} in <strong>{{state}}, {{country}}</strong> to support student skill development, technical workshops, and industry career pathways.</p>

<p><strong>About the Initiative:</strong><br />
Our campus collaboration program connects premier institutions with hands-on technical masterclasses, structured learning pathways, skill certifications, and industry mentorship. Students can build demonstrative project portfolios, collaborate on real-world problem statements, and prepare for placement and internship drives.</p>

<p><strong>Proposed Key Areas of Collaboration:</strong></p>
<ul style="padding-left: 20px; line-height: 1.6;">
  <li><strong>Student Technical Skill Tracks:</strong> Guided orientation and self-paced modules in emerging digital and technical disciplines.</li>
  <li><strong>Expert Faculty &amp; Student Masterclasses:</strong> Interactive technical sessions led by experienced industry practitioners.</li>
  <li><strong>Collegiate Hackathons &amp; Innovation Drives:</strong> National competitions to spotlight student projects and practical innovation.</li>
  <li><strong>Recognized Student Chapter:</strong> Establish an institutional chapter to cultivate student peer-learning and leadership.</li>
</ul>

<p><em>The schedule, topics, faculty support, and specific deliverables will be finalized jointly in alignment with your academic calendar.</em></p>

<p><strong>Institutional Benefits for {{college_name}}:</strong></p>
<ul style="padding-left: 20px; line-height: 1.6;">
  <li>Demonstrated industry-academia partnership supporting placement readiness and NAAC/NIRF criteria.</li>
  <li>Direct guidance from seasoned professionals across technical and management domains.</li>
  <li>Verified credentials and national merit recognition for participating student cohorts.</li>
</ul>

<p><strong>Next Steps:</strong><br />
We would welcome an introductory 15-minute briefing with your leadership team or nominated faculty coordinator to discuss how this initiative can best support students at {{college_name}}. Kindly share a convenient time to take the discussion forward.</p>

<p style="margin-top: 24px;">Warm regards,<br />
<strong>{{sender_name}}</strong><br />
Director — Institutional Outreach &amp; Partnerships<br />
Campus Outreach Initiative</p>`,
    is_default: 1,
  },
  {
    id: 'campus-film-festival-invitation',
    title: 'National Student Innovation & Skills Workshop 2026 (Nomination Invitation)',
    subjectTemplate: 'Official Invitation: National Student Innovation & Skills Workshop 2026 — Nominate Students from {{college_name}}',
    bodyTemplate: `<p>Dear {{contact_salutation}},</p>

<p>Greetings from Campus Outreach Initiative!</p>

<p>We are pleased to invite <strong>{{college_name}}</strong>, {{state}}, to nominate outstanding student cohorts and faculty coordinators for the upcoming <strong>National Student Innovation &amp; Skills Workshop 2026</strong>.</p>

<p>This initiative brings together students and educators across premier institutions to foster applied innovation, hands-on learning, and project excellence. Selected participants receive verified digital credentials, mentorship from industry experts, and project showcase opportunities.</p>

<p><strong>Highlights for {{college_name}}:</strong></p>
<ul style="padding-left: 20px; line-height: 1.6;">
  <li><strong>National Merit Awards:</strong> Institutional commendations and verified certificates for outstanding projects.</li>
  <li><strong>Industry Mentorship:</strong> Direct review and feedback from experienced technology practitioners.</li>
  <li><strong>Departmental Spotlight:</strong> Featured showcase for top innovations from your institution across national partner channels.</li>
</ul>

<p><strong>Nomination Details:</strong><br />
Institutions may nominate student cohorts directly through their department or faculty coordinator by replying to this communication.</p>

<p>We look forward to partnering with {{college_name}} to support student innovation.</p>

<p style="margin-top: 24px;">With highest regards,<br />
<strong>{{sender_name}}</strong><br />
Program Director — Academic Collaborations<br />
Campus Outreach Initiative</p>`,
    is_default: 0,
  },
  {
    id: 'campus-ambassador-initiative',
    title: 'Campus Student Chapter & Innovation Initiative Invitation',
    subjectTemplate: 'Campus Student Chapter Invitation — Partnering with {{college_name}}',
    bodyTemplate: `<p>Dear {{contact_salutation}},</p>

<p>Greetings from Campus Outreach Initiative!</p>

<p>We are excited to invite <strong>{{college_name}}</strong>{{department_clause}} in <strong>{{state}}, {{country}}</strong> to establish an official <strong>Student Innovation &amp; Outreach Chapter</strong> on campus.</p>

<p>A Student Chapter serves as a campus innovation and peer-learning hub, providing nominated student leads with leadership mentorship, hands-on event management experience, and workshop resources.</p>

<p><strong>Benefits for {{college_name}}:</strong></p>
<ul style="padding-left: 20px; line-height: 1.6;">
  <li>Complimentary technical masterclasses and verified skill certificates for nominated students.</li>
  <li>Quarterly interactive sessions with industry leaders and technical innovators.</li>
  <li>Official leadership certificates for student coordinators and faculty advisors.</li>
  <li>Priority access to inter-collegiate competitions and hackathons.</li>
</ul>

<p>We would be pleased to share the formal Chapter framework and discuss nominated student leads at your convenience.</p>

<p style="margin-top: 24px;">Warm regards,<br />
<strong>{{sender_name}}</strong><br />
Campus Relations &amp; Outreach<br />
Campus Outreach Initiative</p>`,
    is_default: 0,
  }
];

/**
 * Converts rich HTML email templates into clean, editable Jinja-templated plain text.
 * Strips raw HTML tags and promotional images while preserving paragraphs, bolding, lists, and Jinja variables.
 */
export function htmlToJinjaText(html) {
  if (!html) return '';
  let text = String(html);

  // Strip all images and promotional banners cleanly
  text = text.replace(/<div[^>]*>\s*<img[^>]*>\s*<\/div>/gi, '');
  text = text.replace(/<img[^>]*>/gi, '');
  text = text.replace(/\[Banner(?::\s*[^\]]*)?\]/gi, '');

  // Convert list items to bullet lines
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gis, (m, c) => `• ${c.trim()}\n`);
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // Convert line breaks and paragraph ends
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Convert bold and italic tags to markdown style
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**');
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**');
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*');
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*');

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&bull;/g, '•')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rarr;/g, '→')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse 3 or more consecutive newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Ensures text line breaks, paragraphs, and indentation are formatted into standard HTML
 * preserving exact visual alignment across all email clients (Gmail, Outlook, Yahoo) and web preview panes.
 * Converts markdown links, bold emphasis, and bullet lists to genuine HTML elements.
 * Completely strips any promotional images or banner tags to guarantee 100% professional delivery.
 */
export function formatBodyToHtml(textOrHtml) {
  if (!textOrHtml) return '';

  let processed = String(textOrHtml);

  // Strip hardcoded promotional creator pass images to prevent spam flagging
  processed = processed.replace(/\[Banner(?::\s*[^\]]*)?\]/gi, '');
  processed = processed.replace(/<div[^>]*>\s*<img[^>]*sf_creator_pass[^>]*>\s*<\/div>/gi, '');
  processed = processed.replace(/<img[^>]*sf_creator_pass[^>]*>/gi, '');
  processed = processed.replace(/<img[^>]*data:image\/svg\+xml;base64[^>]*>/gi, '');

  // Ensure any markdown image syntax is removed from email content body (images are sent as file attachments, not embedded in body)
  processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');

  // Check if string is already semantic HTML (contains <p> or <ul>)
  const isAlreadyHtml = /<p\b[^>]*>/i.test(processed) || /<ul\b[^>]*>/i.test(processed);

  if (isAlreadyHtml) {
    return processed;
  }

  // Convert markdown links: [text](url) -> <a href="url">text</a>
  processed = processed.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" style="color: #0d9488; text-decoration: underline;">$1</a>'
  );

  // Convert standalone http/https URLs not already wrapped in tags
  processed = processed.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" style="color: #0d9488; text-decoration: underline;">$2</a>'
  );

  // Convert markdown bold: **text** -> <strong>text</strong>
  processed = processed.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/(^|[\s(])\*([^*\n]+)\*([\s.,!?)]|$)/gm, '$1<strong>$2</strong>$3');

  // Convert plain text with double newlines into semantic paragraphs, handling bullet lines
  const paragraphs = processed.split(/\r?\n\s*\r?\n/);
  return paragraphs
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return '';

      // Check if paragraph consists of bullet list items
      const lines = trimmed.split(/\r?\n/);
      const isBulletList = lines.length > 0 && lines.every((line) => line.trim().startsWith('•') || line.trim().startsWith('-'));

      if (isBulletList) {
        const lis = lines
          .map((line) => {
            const clean = line.replace(/^[•\-]\s*/, '').trim();
            return `<li style="margin-bottom: 6px;">${clean}</li>`;
          })
          .join('\n');
        return `<ul style="padding-left: 20px; line-height: 1.6; margin: 12px 0; color: #111827;">\n${lis}\n</ul>`;
      }

      const withLineBreaks = trimmed.replace(/\r?\n/g, '<br />\n');
      return `<p style="margin: 0 0 16px 0; line-height: 1.65; color: #111827;">${withLineBreaks}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Safely renders a template string with escaped variable values.
 * Intelligently personalizes greetings, college & department clauses, contact person & designation,
 * geographic location (country, state, city/district), institution name,
 * and handles both bracket [Placeholder] and curly brace {{placeholder}} syntax.
 */
export function renderTemplate(templateStr, variables = {}) {
  const safeCollege = escapeHtml((variables.college_name || variables.institution || '').trim());
  const safeInstitution = safeCollege;
  const safeDepartment = escapeHtml((variables.department || '').trim());
  const safeContact = escapeHtml((variables.contact_person || '').trim());
  const safeDesignation = escapeHtml((variables.designation || '').trim());
  const safeSender = escapeHtml((variables.sender_name || 'Campus Outreach Coordinator').trim());
  const safeEmail = escapeHtml((variables.email || '').trim());
  const safeCountry = escapeHtml((variables.country || variables.country_name || 'India').trim());
  const safeState = escapeHtml((variables.state || variables.state_or_region || 'Andhra Pradesh').trim());

  // Smart Person / Salutation Construction
  let personWithDesignation = safeContact;
  if (safeContact && safeDesignation) {
    personWithDesignation = `${safeContact} (${safeDesignation})`;
  } else if (!safeContact && safeDesignation) {
    personWithDesignation = safeDesignation;
  }
  const salutation = personWithDesignation || 'Sir/Madam';

  // Smart College & Department Construction
  let collegeWithDepartment = safeCollege;
  if (safeCollege && safeDepartment) {
    collegeWithDepartment = `${safeCollege} (${safeDepartment})`;
  } else if (!safeCollege && safeDepartment) {
    collegeWithDepartment = safeDepartment;
  }
  const departmentClause = safeDepartment ? ` (${safeDepartment})` : '';

  let output = templateStr || '';

  // 1. First replace combined placeholders if used
  output = output
    .replace(/\[\s*(?:Contact\s*Person|Contact)\s*(?:&|and)\s*Designation\s*\]/gi, salutation)
    .replace(/\[\s*(?:College\s*Name|College)\s*(?:&|and)\s*Department\s*\]/gi, collegeWithDepartment);

  // 2. Intelligently personalize greeting if generic "Dear Sir/Madam" is used and contact person is provided
  if (safeContact) {
    output = output
      .replace(/Dear\s+(?:Sir\s*\/\s*Madam|Sir|Madam|Faculty\s+Coordinator|Coordinator)\s*,/gi, `Dear ${salutation},`)
      .replace(/Respected\s+(?:Sir\s*\/\s*Madam|Sir|Madam)\s*,/gi, `Respected ${salutation},`);
  }

  // 3. College Name & Institution replacements
  output = output
    .replace(/\[\s*College\s*Name\s*\]/gi, safeCollege)
    .replace(/\[\s*college_name\s*\]/gi, safeCollege)
    .replace(/\[\s*College\s*\]/gi, safeCollege)
    .replace(/\[\s*collegename\s*\]/gi, safeCollege)
    .replace(/\[\s*Institution\s*\]/gi, safeInstitution)
    .replace(/\[\s*institution\s*\]/gi, safeInstitution)
    .replace(/\[\s*University\s*\]/gi, safeCollege)
    .replace(/\{\{\s*college_name\s*\}\}/gi, safeCollege)
    .replace(/\{\s*college_name\s*\}/gi, safeCollege)
    .replace(/\{\{\s*college\s*\}\}/gi, safeCollege)
    .replace(/\{\s*college\s*\}/gi, safeCollege)
    .replace(/\{\{\s*institution\s*\}\}/gi, safeInstitution)
    .replace(/\{\s*institution\s*\}/gi, safeInstitution);

  // 4. Contact Person / Salutation replacements
  output = output
    .replace(/\[\s*Contact\s*Person\s*\]/gi, salutation)
    .replace(/\[\s*contact_person\s*\]/gi, salutation)
    .replace(/\[\s*contactperson\s*\]/gi, salutation)
    .replace(/\[\s*Faculty\s*Name\s*\]/gi, salutation)
    .replace(/\[\s*Faculty\s*\]/gi, salutation)
    .replace(/\[\s*Contact\s*\]/gi, salutation)
    .replace(/\[\s*Person\s*Name\s*\]/gi, salutation)
    .replace(/\[\s*Name\s*\]/gi, salutation)
    .replace(/\[\s*Salutation\s*\]/gi, salutation)
    .replace(/\{\{\s*contact_person\s*\}\}/gi, salutation)
    .replace(/\{\s*contact_person\s*\}/gi, salutation)
    .replace(/\{\{\s*contact_salutation\s*\}\}/gi, salutation)
    .replace(/\{\s*contact_salutation\s*\}/gi, salutation)
    .replace(/\{\{\s*name\s*\}\}/gi, salutation);

  // 5. Department replacements
  const hasDepartmentPlaceholder = /\[\s*(?:Department|dept|division)\s*\]|\{\{\s*department\s*\}\}/i.test(templateStr);
  output = output
    .replace(/\[\s*Department\s*\]/gi, safeDepartment)
    .replace(/\[\s*department\s*\]/gi, safeDepartment)
    .replace(/\[\s*Dept\s*\]/gi, safeDepartment)
    .replace(/\[\s*dept\s*\]/gi, safeDepartment)
    .replace(/\[\s*Division\s*\]/gi, safeDepartment)
    .replace(/\{\{\s*department\s*\}\}/gi, safeDepartment)
    .replace(/\{\s*department\s*\}/gi, safeDepartment)
    .replace(/\{\{\s*department_clause\s*\}\}/gi, departmentClause);

  if (!hasDepartmentPlaceholder && safeDepartment && safeCollege) {
    const escapedCollege = safeCollege.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(collaboration\\s+with\\s+${escapedCollege})(?!\\s*\\()`, 'gi');
    output = output.replace(regex, `$1 (${safeDepartment})`);
  }

  // 6. Designation replacements
  output = output
    .replace(/\[\s*Designation\s*\]/gi, safeDesignation)
    .replace(/\[\s*designation\s*\]/gi, safeDesignation)
    .replace(/\[\s*Role\s*\]/gi, safeDesignation)
    .replace(/\[\s*Title\s*\]/gi, safeDesignation)
    .replace(/\{\{\s*designation\s*\}\}/gi, safeDesignation)
    .replace(/\{\s*designation\s*\}/gi, safeDesignation);

  // 7. Sender Name replacements
  output = output
    .replace(/\[\s*Your\s*Name\s*\]/gi, safeSender)
    .replace(/\[\s*your_name\s*\]/gi, safeSender)
    .replace(/\[\s*Sender\s*Name\s*\]/gi, safeSender)
    .replace(/\[\s*sender_name\s*\]/gi, safeSender)
    .replace(/\[\s*Sender\s*\]/gi, safeSender)
    .replace(/\{\{\s*sender_name\s*\}\}/gi, safeSender)
    .replace(/\{\s*sender_name\s*\}/gi, safeSender);

  // 8. Recipient Email replacements
  output = output
    .replace(/\[\s*Recipient\s*Email\s*\]/gi, safeEmail)
    .replace(/\[\s*recipient_email\s*\]/gi, safeEmail)
    .replace(/\[\s*Email\s*\]/gi, safeEmail)
    .replace(/\{\{\s*email\s*\}\}/gi, safeEmail)
    .replace(/\{\s*email\s*\}/gi, safeEmail);

  // 9. Location & Geographic Metadata replacements
  const safeCityDistrict = escapeHtml((variables.city_district || variables.city || variables.district || '').trim());
  const safeCategory = escapeHtml((variables.category || '').trim());
  const safeWebsite = escapeHtml((variables.website_url || '').trim());
  const safePhone = escapeHtml((variables.phone || '').trim());
  const safeRemarks = escapeHtml((variables.remarks || '').trim());

  output = output
    .replace(/\[\s*Country\s*\]/gi, safeCountry)
    .replace(/\[\s*country\s*\]/gi, safeCountry)
    .replace(/\{\{\s*country\s*\}\}/gi, safeCountry)
    .replace(/\{\{\s*country_name\s*\}\}/gi, safeCountry)
    .replace(/\{\s*country\s*\}/gi, safeCountry)
    .replace(/\[\s*State\s*\]/gi, safeState)
    .replace(/\[\s*state\s*\]/gi, safeState)
    .replace(/\{\{\s*state\s*\}\}/gi, safeState)
    .replace(/\{\s*state\s*\}/gi, safeState)
    .replace(/\[\s*City\s*\/\s*District\s*\]/gi, safeCityDistrict)
    .replace(/\[\s*District\s*\]/gi, safeCityDistrict)
    .replace(/\[\s*City\s*\]/gi, safeCityDistrict)
    .replace(/\{\{\s*city_district\s*\}\}/gi, safeCityDistrict)
    .replace(/\{\s*city_district\s*\}/gi, safeCityDistrict)
    .replace(/\[\s*Category\s*\]/gi, safeCategory)
    .replace(/\[\s*Stream\s*\]/gi, safeCategory)
    .replace(/\{\{\s*category\s*\}\}/gi, safeCategory)
    .replace(/\{\s*category\s*\}/gi, safeCategory)
    .replace(/\[\s*Official\s*Website\s*URL\s*\]/gi, safeWebsite)
    .replace(/\[\s*Website\s*\]/gi, safeWebsite)
    .replace(/\{\{\s*website_url\s*\}\}/gi, safeWebsite)
    .replace(/\{\s*website_url\s*\}/gi, safeWebsite)
    .replace(/\[\s*Phone\s*\]/gi, safePhone)
    .replace(/\[\s*Contact\s*Number\s*\]/gi, safePhone)
    .replace(/\{\{\s*phone\s*\}\}/gi, safePhone)
    .replace(/\{\s*phone\s*\}/gi, safePhone)
    .replace(/\[\s*Remarks\s*\]/gi, safeRemarks)
    .replace(/\{\{\s*remarks\s*\}\}/gi, safeRemarks)
    .replace(/\{\s*remarks\s*\}/gi, safeRemarks);

  return output;
}

/**
 * Validates whether all placeholders in subject and body are resolved.
 * Returns array of remaining unresolved tokens (e.g. ['{{custom_token}}', '[Unknown Tag]']).
 */
export function validateTemplatePlaceholders(text, variables = {}) {
  const rendered = renderTemplate(text, variables);
  const remainingTokens = [];

  // Match curly braces {{...}}
  const curlyMatches = rendered.match(/\{\{([^{}]+)\}\}/g) || [];
  for (const match of curlyMatches) {
    if (!remainingTokens.includes(match)) {
      remainingTokens.push(match);
    }
  }

  // Match square brackets that look like tokens [Placeholder Name] (not links or HTML)
  const bracketMatches = rendered.match(/\[([A-Za-z0-9_\s&/-]{3,30})\](?!\()/g) || [];
  for (const match of bracketMatches) {
    if (!remainingTokens.includes(match) && !match.includes('http')) {
      remainingTokens.push(match);
    }
  }

  return {
    isValid: remainingTokens.length === 0,
    unresolvedTokens: remainingTokens,
    renderedPreview: rendered,
  };
}

/**
 * Wraps body in a clean, modern HTML email layout with responsive image handling
 * and email client compatibility (Gmail, Outlook, Yahoo, Apple Mail).
 */
export function wrapInEmailLayout(bodyHtml, options = {}) {
  const content = formatBodyToHtml(bodyHtml);
  const unsubscribeUrl = options.unsubscribeUrl || 'mailto:outreach@campusoutreach.org?subject=Unsubscribe';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    img { max-width: 100% !important; height: auto !important; border-radius: 6px; }
    p { margin: 0 0 16px 0; }
    a { color: #0d9488; text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.65; color: #111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; width: 100%;">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 680px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <!-- Email Header Bar -->
          <tr>
            <td style="padding: 20px 28px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" vertical-align="middle">
                    <span style="font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">Campus <span style="color: #0d9488; font-weight: 600;">Outreach</span></span>
                  </td>
                  <td align="right" vertical-align="middle">
                    <span style="font-size: 11px; font-weight: 600; color: #64748b; background-color: #f1f5f9; padding: 4px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Institutional Communication</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 32px 28px; color: #111827; font-size: 14px; line-height: 1.68;">
              ${content}
            </td>
          </tr>

          <!-- Email Footer -->
          <tr>
            <td style="padding: 20px 28px; border-top: 1px solid #f1f5f9; background-color: #f8fafc; font-size: 11px; color: #64748b; line-height: 1.6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <strong>Campus Email Automation Platform</strong> &bull; Institutional Partnerships<br />
                    To manage your email preferences or opt out of institutional communications, <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">click here to unsubscribe</a>.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
