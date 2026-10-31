import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config, normalizeEmail } from './config.js';
import { DEFAULT_TEMPLATES } from './templates.js';

let DatabaseSync = null;
try {
  const sqlite = await import('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync || null;
} catch (importErr) {
  console.warn('[Database] node:sqlite module not available in this Node runtime, using in-memory store:', importErr?.message);
}

let dbInstance = null;

/**
 * Resilient In-Memory SQL store fallback for environments where SQLite or native filesystem is restricted
 */
class MemorySqlStore {
  constructor() {
    this.users = new Map();
    this.templates = new Map();
    this.logs = [];
    this.audit = [];
    this.settings = new Map();
    this.countries = [];
    this.regions = [];
    this.colleges = [];
    this.contacts = [];
    this.campaigns = [];
    this.trackingEvents = [];
    this.images = [];
    this.initDefaultData();
  }

  initDefaultData() {
    const adminEmail = normalizeEmail(config.ADMIN_EMAIL);
    const passwordHash = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
    this.users.set(adminEmail, {
      id: 'usr_admin_bootstrap',
      email: adminEmail,
      password_hash: passwordHash,
      role: 'admin',
      is_active: 1,
      can_send: 1,
      created_at: new Date().toISOString(),
    });

    for (const t of DEFAULT_TEMPLATES) {
      this.templates.set(t.id, {
        id: t.id,
        title: t.title,
        subject_template: t.subjectTemplate || t.subject_template,
        body_template: t.bodyTemplate || t.body_template,
        is_default: t.is_default ?? 0,
        created_at: new Date().toISOString(),
      });
    }

    this.settings.set('smtp_host', config.SMTP_HOST || 'smtp.gmail.com');
    this.settings.set('smtp_port', String(config.SMTP_PORT || 465));
    this.settings.set('smtp_secure', config.SMTP_SECURE ? '1' : '0');
    this.settings.set('smtp_user', 'dharshana.shortfundly@gmail.com');
    if (config.SMTP_PASS) this.settings.set('smtp_pass', config.SMTP_PASS);
    this.settings.set('from_email', config.FROM_EMAIL || 'campus@shortfundly.com');
    this.settings.set('from_name', config.FROM_NAME || 'Campus Outreach Coordinator');
    this.settings.set('smtp_auth_method', 'app_password');

    this.countries = [
      { code: 'IN', name: 'India', phone_code: '+91' },
      { code: 'US', name: 'United States', phone_code: '+1' },
      { code: 'GB', name: 'United Kingdom', phone_code: '+44' },
      { code: 'CA', name: 'Canada', phone_code: '+1' },
      { code: 'AU', name: 'Australia', phone_code: '+61' },
    ];
    this.regions = [
      { id: 'IN-AP', country_code: 'IN', name: 'Andhra Pradesh', type: 'state' },
      { id: 'IN-MH', country_code: 'IN', name: 'Maharashtra', type: 'state' },
      { id: 'IN-TN', country_code: 'IN', name: 'Tamil Nadu', type: 'state' },
      { id: 'IN-KA', country_code: 'IN', name: 'Karnataka', type: 'state' },
      { id: 'US-CA', country_code: 'US', name: 'California', type: 'state' },
      { id: 'US-NY', country_code: 'US', name: 'New York', type: 'state' },
    ];
  }

  exec() {
    return;
  }

  prepare(sql) {
    const s = sql.trim();
    const self = this;

    // users
    if (s.includes('FROM users WHERE email = ?')) {
      return {
        get: (email) => {
          const norm = normalizeEmail(email);
          for (const u of self.users.values()) {
            if (u.email === norm) return { ...u };
          }
          return undefined;
        }
      };
    }
    if (s.includes('FROM users WHERE id = ?')) {
      return {
        get: (id) => {
          for (const u of self.users.values()) {
            if (u.id === id) return { ...u };
          }
          return undefined;
        }
      };
    }
    if (s.includes('PRAGMA table_info(users)')) {
      return {
        all: () => [{ name: 'is_active' }, { name: 'can_send' }]
      };
    }
    if (s.startsWith('INSERT INTO users')) {
      return {
        run: (id, email, password_hash, role, is_active, can_send, created_at) => {
          self.users.set(normalizeEmail(email), { id, email: normalizeEmail(email), password_hash, role, is_active, can_send, created_at });
          return { changes: 1 };
        }
      };
    }
    if (s.startsWith('UPDATE users SET role =')) {
      return {
        run: (...args) => {
          const id = args[args.length - 1];
          for (const u of self.users.values()) {
            if (u.id === id) {
              if (args.length === 5) {
                u.role = args[0]; u.is_active = args[1]; u.can_send = args[2]; u.password_hash = args[3];
              } else {
                u.role = args[0]; u.is_active = args[1]; u.can_send = args[2];
              }
              return { changes: 1 };
            }
          }
          return { changes: 0 };
        }
      };
    }

    // email_templates
    if (s.includes('FROM email_templates') && s.includes('ORDER BY')) {
      return {
        all: () => Array.from(self.templates.values())
      };
    }
    if (s.includes('FROM email_templates WHERE id = ?')) {
      return {
        get: (id) => self.templates.get(id)
      };
    }
    if (s.startsWith('DELETE FROM email_templates WHERE id = ?')) {
      return {
        run: (id) => {
          const deleted = self.templates.delete(id);
          return { changes: deleted ? 1 : 0 };
        }
      };
    }
    if (s.includes('INSERT INTO email_templates')) {
      return {
        run: (id, title, subject_template, body_template, is_default, created_at) => {
          self.templates.set(id, { id, title, subject_template, body_template, is_default: is_default ?? 0, created_at });
          return { changes: 1 };
        }
      };
    }

    // outreach_logs
    if (s.includes('INSERT INTO outreach_logs')) {
      return {
        run: (...args) => {
          const [id, college_name, email, normalized_email, department, contact_person, designation, subject, body_html, body_text, sent_by, created_at, override_duplicate, override_reason, campaign_id, country, state, tracking_token] = args;
          self.logs.unshift({
            id, college_name, email, normalized_email, department, contact_person, designation, subject, body_html, body_text,
            status: 'PENDING', failure_type: 'NONE', attempts: 0, sent_by, created_at, override_duplicate, override_reason,
            campaign_id: campaign_id || null, country: country || 'India', state: state || 'Andhra Pradesh', tracking_token: tracking_token || null
          });
          return { changes: 1 };
        }
      };
    }
    if (s.includes("UPDATE outreach_logs SET status = 'PROCESSING'")) {
      return {
        run: (last_attempt_at, id) => {
          const row = self.logs.find(r => r.id === id);
          if (row) {
            row.status = 'PROCESSING';
            row.attempts = (row.attempts || 0) + 1;
            row.last_attempt_at = last_attempt_at;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
    if (s.includes("UPDATE outreach_logs SET status = 'ACCEPTED'")) {
      return {
        run: (smtp_response, smtp_message_id, sent_at, id) => {
          const row = self.logs.find(r => r.id === id);
          if (row) {
            row.status = 'ACCEPTED';
            row.smtp_response = smtp_response;
            row.smtp_message_id = smtp_message_id;
            row.sent_at = sent_at;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
    if (s.includes('UPDATE outreach_logs SET status = ?') && s.includes('failure_type = ?')) {
      return {
        run: (status, failure_type, error_message, smtp_response, id) => {
          const row = self.logs.find(r => r.id === id);
          if (row) {
            row.status = status;
            row.failure_type = failure_type;
            row.error_message = error_message;
            row.smtp_response = smtp_response;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
    if (s.includes('FROM outreach_logs WHERE id = ?')) {
      return {
        get: (id) => self.logs.find(r => r.id === id)
      };
    }
    if (s.includes('FROM outreach_logs') && s.includes('COUNT(*)')) {
      return {
        get: () => {
          if (s.includes("status = 'ACCEPTED'")) return { count: self.logs.filter(r => r.status === 'ACCEPTED').length };
          if (s.includes("status = 'FAILED'")) return { count: self.logs.filter(r => r.status === 'FAILED').length };
          if (s.includes("status = 'PENDING'")) return { count: self.logs.filter(r => r.status === 'PENDING').length };
          if (s.includes("status = 'PROCESSING'")) return { count: self.logs.filter(r => r.status === 'PROCESSING').length };
          if (s.includes("status = 'UNKNOWN'")) return { count: self.logs.filter(r => r.status === 'UNKNOWN').length };
          return { count: self.logs.length };
        }
      };
    }
    if (s.includes('FROM outreach_logs') && !s.includes('WHERE id = ?')) {
      return {
        all: () => self.logs.slice(0, 50),
        get: () => ({ total: self.logs.length })
      };
    }
    if (s.includes('DELETE FROM outreach_logs WHERE id = ?')) {
      return {
        run: (id) => {
          const initialLen = self.logs.length;
          self.logs = self.logs.filter(r => r.id !== id);
          return { changes: self.logs.length < initialLen ? 1 : 0 };
        }
      };
    }

    // audit_logs
    if (s.includes('INSERT INTO audit_logs')) {
      return {
        run: (id, user_email, ip_address, action, details, created_at) => {
          self.audit.push({ id, user_email, ip_address, action, details, created_at });
          return { changes: 1 };
        }
      };
    }

    // system_settings
    if (s.includes('SELECT value FROM system_settings WHERE key = ?')) {
      return {
        get: (key) => {
          let val = self.settings.get(key);
          if (key === 'smtp_user' && (!val || val.toLowerCase().includes('campus@shortfundly'))) {
            val = 'dharshana.shortfundly@gmail.com';
            self.settings.set('smtp_user', val);
          }
          return val ? { value: val } : undefined;
        }
      };
    }
    if (s.includes('INSERT INTO system_settings') || s.includes('INSERT OR IGNORE INTO system_settings')) {
      return {
        run: (key, value) => {
          let val = value;
          if (key === 'smtp_user' && (!val || String(val).toLowerCase().includes('campus@shortfundly'))) {
            val = 'dharshana.shortfundly@gmail.com';
          }
          self.settings.set(key, val);
          return { changes: 1 };
        }
      };
    }

    // Fallback handler
    return {
      run: () => ({ changes: 1 }),
      get: () => undefined,
      all: () => [],
    };
  }
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  );

  let dataDir;
  if (isServerless) {
    dataDir = path.join(os.tmpdir(), 'shortfundly_campus_data');
  } else {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    dataDir = path.resolve(currentDir, '../../data');
  }

  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (fsErr) {
    console.warn('[Database] Read-only dataDir, falling back to os.tmpdir():', fsErr?.message);
    dataDir = os.tmpdir();
  }

  const dbPath = path.join(dataDir, 'outreach.db');

  let db;
  try {
    if (!DatabaseSync) {
      throw new Error('DatabaseSync is unavailable in current runtime');
    }
    db = new DatabaseSync(dbPath);
    if (isServerless) {
      db.exec('PRAGMA journal_mode = MEMORY;');
    } else {
      db.exec('PRAGMA journal_mode = WAL;');
    }
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA foreign_keys = ON;');

    // Schema creation
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        is_active INTEGER NOT NULL DEFAULT 1,
        can_send INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outreach_logs (
        id TEXT PRIMARY KEY,
        college_name TEXT NOT NULL,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL,
        department TEXT NOT NULL,
        contact_person TEXT,
        designation TEXT,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT,
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
        failure_type TEXT DEFAULT 'NONE',
        error_message TEXT,
        smtp_response TEXT,
        smtp_message_id TEXT,
        attempts INTEGER DEFAULT 0,
        last_attempt_at TEXT,
        sent_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        override_duplicate INTEGER DEFAULT 0,
        override_reason TEXT,
        campaign_id TEXT,
        country TEXT DEFAULT 'India',
        state TEXT DEFAULT 'Andhra Pradesh',
        tracking_token TEXT,
        opened_at TEXT,
        open_count INTEGER DEFAULT 0,
        clicked_at TEXT,
        click_count INTEGER DEFAULT 0,
        last_clicked_url TEXT,
        delivery_status TEXT DEFAULT 'ACCEPTED',
        attachments TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject_template TEXT NOT NULL,
        body_template TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        attachments TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        ip_address TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE TABLE IF NOT EXISTS geo_countries (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone_code TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS geo_regions (
        id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL REFERENCES geo_countries(code) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'state',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS colleges (
        id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL,
        country_name TEXT NOT NULL,
        state_or_region TEXT NOT NULL,
        district TEXT,
        city TEXT,
        college_name TEXT NOT NULL,
        category TEXT,
        website_url TEXT,
        phone TEXT,
        source TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS college_contacts (
        id TEXT PRIMARY KEY,
        college_id TEXT NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
        contact_person TEXT,
        designation TEXT,
        department TEXT,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL,
        phone TEXT,
        role_type TEXT DEFAULT 'generic',
        is_primary INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        template_id TEXT,
        body_html TEXT NOT NULL,
        body_text TEXT,
        target_countries TEXT,
        target_states TEXT,
        selected_colleges_count INTEGER DEFAULT 0,
        total_recipients INTEGER DEFAULT 0,
        queued_count INTEGER DEFAULT 0,
        accepted_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        opened_count INTEGER DEFAULT 0,
        clicked_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'COMPLETED',
        track_opens INTEGER DEFAULT 1,
        track_clicks INTEGER DEFAULT 1,
        attachments TEXT DEFAULT '[]',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS email_tracking_events (
        id TEXT PRIMARY KEY,
        outreach_id TEXT NOT NULL,
        campaign_id TEXT,
        event_type TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        target_url TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS uploaded_images (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        url TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        uploaded_by TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outreach_normalized_email ON outreach_logs(normalized_email);
      CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_logs(status);
      CREATE INDEX IF NOT EXISTS idx_outreach_created_at ON outreach_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_outreach_college ON outreach_logs(college_name);
      CREATE INDEX IF NOT EXISTS idx_outreach_campaign_id ON outreach_logs(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_outreach_tracking_token ON outreach_logs(tracking_token);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_colleges_country_state ON colleges(country_code, state_or_region);
      CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(college_name);
      CREATE INDEX IF NOT EXISTS idx_contacts_college ON college_contacts(college_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON college_contacts(normalized_email);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_tracking_events_outreach ON email_tracking_events(outreach_id);
    `);

    // Safe migration checks for existing tables
    try {
      const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
      if (!userCols.includes('is_active')) {
        db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
      }
      if (!userCols.includes('can_send')) {
        db.exec('ALTER TABLE users ADD COLUMN can_send INTEGER NOT NULL DEFAULT 1;');
      }
      if (!userCols.includes('name')) {
        db.exec('ALTER TABLE users ADD COLUMN name TEXT;');
      }

      const logCols = db.prepare('PRAGMA table_info(outreach_logs)').all().map((c) => c.name);
      const addLogCol = (col, type) => {
        if (!logCols.includes(col)) {
          db.exec(`ALTER TABLE outreach_logs ADD COLUMN ${col} ${type};`);
        }
      };
      addLogCol('campaign_id', 'TEXT');
      addLogCol('country', 'TEXT DEFAULT "India"');
      addLogCol('state', 'TEXT DEFAULT "Andhra Pradesh"');
      addLogCol('tracking_token', 'TEXT');
      addLogCol('opened_at', 'TEXT');
      addLogCol('open_count', 'INTEGER DEFAULT 0');
      addLogCol('clicked_at', 'TEXT');
      addLogCol('click_count', 'INTEGER DEFAULT 0');
      addLogCol('last_clicked_url', 'TEXT');
      addLogCol('delivery_status', 'TEXT DEFAULT "ACCEPTED"');
      addLogCol('attachments', 'TEXT DEFAULT "[]"');

      const tplCols = db.prepare('PRAGMA table_info(email_templates)').all().map((c) => c.name);
      if (!tplCols.includes('attachments')) {
        db.exec('ALTER TABLE email_templates ADD COLUMN attachments TEXT DEFAULT "[]";');
      }

      const campCols = db.prepare('PRAGMA table_info(campaigns)').all().map((c) => c.name);
      if (!campCols.includes('attachments')) {
        db.exec('ALTER TABLE campaigns ADD COLUMN attachments TEXT DEFAULT "[]";');
      }

      // Seed all 28 States and 8 Union Territories for India
      const allIndiaRegions = [
        { id: 'IN-AP', name: 'Andhra Pradesh', type: 'state' },
        { id: 'IN-AR', name: 'Arunachal Pradesh', type: 'state' },
        { id: 'IN-AS', name: 'Assam', type: 'state' },
        { id: 'IN-BR', name: 'Bihar', type: 'state' },
        { id: 'IN-CT', name: 'Chhattisgarh', type: 'state' },
        { id: 'IN-GA', name: 'Goa', type: 'state' },
        { id: 'IN-GJ', name: 'Gujarat', type: 'state' },
        { id: 'IN-HR', name: 'Haryana', type: 'state' },
        { id: 'IN-HP', name: 'Himachal Pradesh', type: 'state' },
        { id: 'IN-JH', name: 'Jharkhand', type: 'state' },
        { id: 'IN-KA', name: 'Karnataka', type: 'state' },
        { id: 'IN-KL', name: 'Kerala', type: 'state' },
        { id: 'IN-MP', name: 'Madhya Pradesh', type: 'state' },
        { id: 'IN-MH', name: 'Maharashtra', type: 'state' },
        { id: 'IN-MN', name: 'Manipur', type: 'state' },
        { id: 'IN-ML', name: 'Meghalaya', type: 'state' },
        { id: 'IN-MZ', name: 'Mizoram', type: 'state' },
        { id: 'IN-NL', name: 'Nagaland', type: 'state' },
        { id: 'IN-OR', name: 'Odisha', type: 'state' },
        { id: 'IN-PB', name: 'Punjab', type: 'state' },
        { id: 'IN-RJ', name: 'Rajasthan', type: 'state' },
        { id: 'IN-SK', name: 'Sikkim', type: 'state' },
        { id: 'IN-TN', name: 'Tamil Nadu', type: 'state' },
        { id: 'IN-TG', name: 'Telangana', type: 'state' },
        { id: 'IN-TR', name: 'Tripura', type: 'state' },
        { id: 'IN-UP', name: 'Uttar Pradesh', type: 'state' },
        { id: 'IN-UT', name: 'Uttarakhand', type: 'state' },
        { id: 'IN-WB', name: 'West Bengal', type: 'state' },
        { id: 'IN-AN', name: 'Andaman and Nicobar Islands', type: 'union_territory' },
        { id: 'IN-CH', name: 'Chandigarh', type: 'union_territory' },
        { id: 'IN-DH', name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'union_territory' },
        { id: 'IN-DL', name: 'Delhi NCR', type: 'union_territory' },
        { id: 'IN-JK', name: 'Jammu and Kashmir', type: 'union_territory' },
        { id: 'IN-LA', name: 'Ladakh', type: 'union_territory' },
        { id: 'IN-LD', name: 'Lakshadweep', type: 'union_territory' },
        { id: 'IN-PY', name: 'Puducherry', type: 'union_territory' }
      ];

      const insertRegStmt = db.prepare(`
        INSERT OR IGNORE INTO geo_regions (id, country_code, name, type, created_at)
        VALUES (?, 'IN', ?, ?, ?)
      `);
      const migrationNow = new Date().toISOString();
      for (const reg of allIndiaRegions) {
        insertRegStmt.run(reg.id, reg.name, reg.type, migrationNow);
      }
    } catch (migErr) {
      console.warn('[Database] Safe migration note:', migErr?.message);
    }

    // Controlled Bootstrap: Administrator creation & synchronization
    const adminEmail = normalizeEmail(config.ADMIN_EMAIL);
    const existingAdmin = db.prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?').get(adminEmail);

    if (!existingAdmin) {
      const adminId = 'usr_' + Date.now();
      const passwordHash = bcrypt.hashSync(config.ADMIN_PASSWORD, 12);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, is_active, can_send, created_at)
        VALUES (?, ?, ?, 'admin', 1, 1, ?)
      `).run(adminId, adminEmail, passwordHash, now);

      db.prepare(`
        INSERT INTO audit_logs (id, user_email, ip_address, action, details, created_at)
        VALUES (?, ?, 'system', 'BOOTSTRAP_ADMIN_CREATED', ?, ?)
      `).run('aud_' + Date.now(), adminEmail, `Bootstrap admin created for ${adminEmail}`, now);
    } else if (!bcrypt.compareSync(config.ADMIN_PASSWORD, existingAdmin.password_hash)) {
      const passwordHash = bcrypt.hashSync(config.ADMIN_PASSWORD, 12);
      db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?').run(passwordHash, existingAdmin.id);
    }

    // Pre-seed default Shortfundly Campus outreach templates if empty
    const templateCount = db.prepare('SELECT COUNT(*) as count FROM email_templates').get();
    if (!templateCount || templateCount.count === 0) {
      const insertTemplate = db.prepare(`
        INSERT INTO email_templates (id, title, subject_template, body_template, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      for (const t of DEFAULT_TEMPLATES) {
        insertTemplate.run(t.id, t.title, t.subjectTemplate, t.bodyTemplate, t.is_default, now);
      }
    } else {
      // Auto-migrate legacy templates: remove promotional banners & replace with clean professional academic templates
      const updateTpl = db.prepare(`
        UPDATE email_templates
        SET title = ?, subject_template = ?, body_template = ?
        WHERE id = ? AND (body_template LIKE '%sf_creator%' OR body_template LIKE '%Campus Pass%' OR body_template LIKE '%Shortfundly Hub%' OR body_template LIKE '%Banner:%' OR body_template LIKE '%<img%')
      `);
      for (const t of DEFAULT_TEMPLATES) {
        try {
          updateTpl.run(t.title, t.subjectTemplate, t.bodyTemplate, t.id);
        } catch {}
      }
    }

    // Pre-seed default system_settings
    const nowIso = new Date().toISOString();
    const seedSetting = db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, 'system')
    `);
    seedSetting.run('smtp_host', config.SMTP_HOST || 'smtp.gmail.com', nowIso);
    seedSetting.run('smtp_port', String(config.SMTP_PORT || 465), nowIso);
    seedSetting.run('smtp_secure', config.SMTP_SECURE ? '1' : '0', nowIso);
    seedSetting.run('smtp_user', 'dharshana.shortfundly@gmail.com', nowIso);
    if (config.SMTP_PASS) {
      seedSetting.run('smtp_pass', config.SMTP_PASS, nowIso);
    }
    seedSetting.run('from_email', config.FROM_EMAIL || 'campus@shortfundly.com', nowIso);
    seedSetting.run('from_name', config.FROM_NAME || 'Campus Outreach Coordinator', nowIso);
    seedSetting.run('smtp_auth_method', 'app_password', nowIso);
    seedSetting.run('track_opens_default', '1', nowIso);
    seedSetting.run('track_clicks_default', '1', nowIso);

    dbInstance = db;
    return dbInstance;
  } catch (dbInitErr) {
    console.warn('[Database] SQLite DatabaseSync failed, activating MemorySqlStore fallback:', dbInitErr?.message);
    dbInstance = new MemorySqlStore();
    return dbInstance;
  }
}

/**
 * Checks for duplicates atomically within the configured cooldown window
 */
export function checkDuplicateOutreach(email, cooldownDays = config.DUPLICATE_COOLDOWN_DAYS) {
  const db = getDb();
  const normalized = normalizeEmail(email);
  const cutoffDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    SELECT id, college_name, email, department, status, created_at, sent_at
    FROM outreach_logs
    WHERE normalized_email = ?
      AND created_at >= ?
      AND status IN ('ACCEPTED', 'PROCESSING', 'PENDING')
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const lastRecord = stmt.get(normalized, cutoffDate);

  if (lastRecord) {
    const diffMs = Date.now() - new Date(lastRecord.created_at).getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return {
      isDuplicate: true,
      daysAgo,
      lastRecord,
      policyDays: cooldownDays,
      message: `A campus outreach email was already initiated for ${email} ${daysAgo === 0 ? 'today' : `${daysAgo} day(s) ago`} (Status: ${lastRecord.status}). Outreach cooldown is ${cooldownDays} days.`
    };
  }

  return {
    isDuplicate: false,
    policyDays: cooldownDays,
    message: 'Recipient email is clear for outreach.'
  };
}

/**
 * Writes an audit log record
 */
export function logAuditEvent(action, details, userEmail = null, ipAddress = 'unknown') {
  try {
    const db = getDb();
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    db.prepare(`
      INSERT INTO audit_logs (id, user_email, ip_address, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userEmail, ipAddress, action, typeof details === 'string' ? details : JSON.stringify(details), new Date().toISOString());
  } catch (err) {
    console.error('[AuditLog] Failed to record audit log:', err);
  }
}

function getSettingsCachePath() {
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  );
  const dir = isServerless
    ? path.join(os.tmpdir(), 'shortfundly_campus_data')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
  return path.join(dir, 'settings_cache.json');
}

function persistSettingFile(key, value) {
  try {
    const filePath = getSettingsCachePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data = {};
    if (fs.existsSync(filePath)) {
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
    }
    data[key] = value;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function readSettingFile(key) {
  try {
    const filePath = getSettingsCachePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && data[key] !== undefined && data[key] !== null) return data[key];
    }
  } catch {}
  return null;
}

export function getSystemSetting(key, fallback = null) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (row && row.value !== undefined && row.value !== null && row.value !== '') {
      if (key === 'smtp_user' && String(row.value).toLowerCase().includes('campus@shortfundly')) {
        return 'dharshana.shortfundly@gmail.com';
      }
      return row.value;
    }
  } catch {}

  const fileVal = readSettingFile(key);
  if (fileVal !== null && fileVal !== undefined && fileVal !== '') {
    if (key === 'smtp_user' && String(fileVal).toLowerCase().includes('campus@shortfundly')) {
      return 'dharshana.shortfundly@gmail.com';
    }
    return fileVal;
  }

  if (key === 'smtp_user' && (!fallback || String(fallback).toLowerCase().includes('campus@shortfundly'))) {
    return 'dharshana.shortfundly@gmail.com';
  }
  return fallback;
}

export function setSystemSetting(key, value, updatedBy = 'system') {
  let val = String(value);
  if (key === 'smtp_user' && (!val || val.toLowerCase().includes('campus@shortfundly'))) {
    val = 'dharshana.shortfundly@gmail.com';
  }
  persistSettingFile(key, val);

  try {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(key, val, now, updatedBy);
  } catch (err) {
    console.warn('[Database] setSystemSetting warning:', err?.message);
  }
}

export function getEffectiveSmtpSettings() {
  const host = getSystemSetting('smtp_host', config.SMTP_HOST || 'smtp.gmail.com');
  const port = Number(getSystemSetting('smtp_port', config.SMTP_PORT || 465));
  const secure = getSystemSetting('smtp_secure', config.SMTP_SECURE ? '1' : '0') === '1';
  let user = getSystemSetting('smtp_user', config.SMTP_USER || 'dharshana.shortfundly@gmail.com');
  if (!user || user.trim().toLowerCase().includes('campus@shortfundly')) {
    user = 'dharshana.shortfundly@gmail.com';
  }
  const pass = getSystemSetting('smtp_pass', config.SMTP_PASS || '');
  const from_email = getSystemSetting('from_email', config.FROM_EMAIL || 'campus@shortfundly.com');
  const from_name = getSystemSetting('from_name', config.FROM_NAME || 'Campus Outreach Coordinator');
  const auth_method = getSystemSetting('smtp_auth_method', 'app_password');
  const smtp_enabled = getSystemSetting('smtp_enabled', '1') !== '0';
  // Default simulation_mode to true ('1') so no real emails are dispatched unless explicitly switched off
  const simulation_mode = getSystemSetting('simulation_mode', '1') !== '0';

  return {
    host,
    port,
    secure,
    user,
    pass,
    from_email,
    from_name,
    auth_method,
    smtp_enabled,
    simulation_mode,
    is_configured: Boolean(user && pass),
  };
}

/**
 * ----------------------------------------------------
 * GEOGRAPHIC TARGETING HELPERS
 * ----------------------------------------------------
 */

export function getGeoCountries() {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT c.code, c.name, c.phone_code,
             COUNT(DISTINCT col.id) as college_count,
             COUNT(DISTINCT cnt.id) as contact_count
      FROM geo_countries c
      LEFT JOIN colleges col ON col.country_code = c.code
      LEFT JOIN college_contacts cnt ON cnt.college_id = col.id
      GROUP BY c.code, c.name, c.phone_code
      ORDER BY college_count DESC, c.name ASC
    `).all();
    return rows;
  } catch (err) {
    console.error('[Database] getGeoCountries error:', err);
    return [];
  }
}

export function getGeoRegions(countryCode) {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT r.id, r.country_code, r.name, r.type,
             COUNT(DISTINCT col.id) as college_count,
             COUNT(DISTINCT cnt.id) as contact_count
      FROM geo_regions r
      LEFT JOIN colleges col ON (col.country_code = r.country_code AND col.state_or_region = r.name)
      LEFT JOIN college_contacts cnt ON cnt.college_id = col.id
      WHERE r.country_code = ?
      GROUP BY r.id, r.country_code, r.name, r.type
      ORDER BY college_count DESC, r.name ASC
    `).all(countryCode);
    return rows;
  } catch (err) {
    console.error('[Database] getGeoRegions error:', err);
    return [];
  }
}

export function getGeoColleges({ countries = [], states = [], search = '', category = '', district = '', page = 1, limit = 50 }) {
  const db = getDb();
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (countries.length > 0) {
      const placeholders = countries.map(() => '?').join(',');
      whereClause += ` AND (c.country_code IN (${placeholders}) OR c.country_name IN (${placeholders}))`;
      params.push(...countries, ...countries);
    }

    if (states.length > 0) {
      const placeholders = states.map(() => '?').join(',');
      whereClause += ` AND c.state_or_region IN (${placeholders})`;
      params.push(...states);
    }

    if (search.trim()) {
      const wild = `%${search.trim()}%`;
      whereClause += ` AND (c.college_name LIKE ? OR c.city LIKE ? OR c.district LIKE ? OR c.website_url LIKE ?)`;
      params.push(wild, wild, wild, wild);
    }

    if (category && category !== 'all') {
      whereClause += ` AND c.category LIKE ?`;
      params.push(`%${category}%`);
    }

    if (district && district !== 'all') {
      whereClause += ` AND (c.district = ? OR c.city = ?)`;
      params.push(district, district);
    }

    const countSql = `SELECT COUNT(*) as cnt FROM colleges c ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? totalRow.cnt : 0;

    const offset = Math.max(0, (page - 1) * limit);
    const dataSql = `
      SELECT c.id, c.country_code, c.country_name, c.state_or_region, c.district, c.city,
             c.college_name, c.category, c.website_url, c.phone, c.source, c.created_at
      FROM colleges c
      ${whereClause}
      ORDER BY c.state_or_region ASC, c.college_name ASC
      LIMIT ? OFFSET ?
    `;

    const collegeRows = db.prepare(dataSql).all(...params, limit, offset);

    // Fetch contacts for these colleges
    if (collegeRows.length > 0) {
      const collegeIds = collegeRows.map(c => c.id);
      const idPlaceholders = collegeIds.map(() => '?').join(',');
      const contactsSql = `
        SELECT id, college_id, contact_person, designation, department, email, phone, role_type, is_primary
        FROM college_contacts
        WHERE college_id IN (${idPlaceholders})
        ORDER BY is_primary DESC, role_type ASC
      `;
      const allContacts = db.prepare(contactsSql).all(...collegeIds);
      const contactMap = {};
      for (const ct of allContacts) {
        if (!contactMap[ct.college_id]) contactMap[ct.college_id] = [];
        contactMap[ct.college_id].push(ct);
      }

      for (const clg of collegeRows) {
        clg.contacts = contactMap[clg.id] || [];
        clg.all_available_emails = clg.contacts.map(c => c.email);
        clg.primary_email = clg.contacts.find(c => c.is_primary)?.email || clg.contacts[0]?.email || '';
      }
    }

    // Available categories and districts for filtering
    const distParams = [];
    let distWhere = 'WHERE 1=1';
    if (countries.length > 0) {
      distWhere += ` AND (country_code IN (${countries.map(() => '?').join(',')}) OR country_name IN (${countries.map(() => '?').join(',')}))`;
      distParams.push(...countries, ...countries);
    }
    if (states.length > 0) {
      distWhere += ` AND state_or_region IN (${states.map(() => '?').join(',')})`;
      distParams.push(...states);
    }

    const districts = db.prepare(`
      SELECT DISTINCT district FROM colleges ${distWhere} AND district IS NOT NULL AND district != '' ORDER BY district ASC
    `).all(...distParams).map(r => r.district);

    const categories = db.prepare(`
      SELECT DISTINCT category FROM colleges ${distWhere} AND category IS NOT NULL AND category != '' ORDER BY category ASC
    `).all(...distParams).map(r => r.category);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      colleges: collegeRows,
      districts,
      categories,
    };
  } catch (err) {
    console.error('[Database] getGeoColleges error:', err);
    return { total: 0, page: 1, limit: 50, totalPages: 1, colleges: [], districts: [], categories: [] };
  }
}

export function importCollegesAndContacts({ countryCode = 'IN', countryName = 'India', stateOrRegion = 'Andhra Pradesh', rows = [] }) {
  const db = getDb();
  const now = new Date().toISOString();

  const insertCollege = db.prepare(`
    INSERT INTO colleges (id, country_code, country_name, state_or_region, district, city, college_name, category, website_url, phone, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom_import', ?)
  `);

  const insertContact = db.prepare(`
    INSERT INTO college_contacts (id, college_id, contact_person, designation, department, email, normalized_email, phone, role_type, is_primary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let collegesImported = 0;
  let contactsImported = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const collegeName = (
        r.college_name ||
        r['College Name'] ||
        r['College name'] ||
        r['college name'] ||
        r.name ||
        r['Name'] ||
        ''
      ).trim();
      if (!collegeName) continue;

      const rowCountryCode = (r.country_code || r['Country Code'] || countryCode || 'IN').trim().toUpperCase();
      const rowCountryName = (r.country_name || r.country || r['Country'] || countryName || 'India').trim();
      const rowState = (r.state_or_region || r.state || r['State'] || stateOrRegion || 'Andhra Pradesh').trim();

      // Ensure country exists
      db.prepare(`
        INSERT OR IGNORE INTO geo_countries (code, name, created_at)
        VALUES (?, ?, ?)
      `).run(rowCountryCode, rowCountryName, now);

      // Ensure region exists
      const regionId = `${rowCountryCode}-${rowState.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
      db.prepare(`
        INSERT OR IGNORE INTO geo_regions (id, country_code, name, type, created_at)
        VALUES (?, ?, ?, 'state', ?)
      `).run(regionId, rowCountryCode, rowState, now);

      const collegeId = `clg_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      const district = (r.district || r['District'] || '').trim();
      const city = (r.city || r['City'] || r['Place'] || '').trim();
      const category = (r.category || r['Category'] || r['College Type'] || 'Engineering / Higher Education').trim();
      const website = (r.website_url || r.website || r['Official website URL'] || r['Official Website'] || r['Website'] || '').trim();
      const phone = (r.phone || r['Phone'] || r['Phone / Mobile'] || '').trim();

      insertCollege.run(
        collegeId,
        rowCountryCode,
        rowCountryName,
        rowState,
        district || null,
        city || null,
        collegeName,
        category || null,
        website || null,
        phone || null,
        now
      );
      collegesImported++;

      // Handle emails
      let rawEmails = r.emails || r.email || r['Email'] || r['Recipient Email'] || r['Email Address'] || r['Official Email'] || '';
      let emailList = [];
      if (Array.isArray(rawEmails)) {
        emailList = rawEmails.map(e => String(e).trim()).filter(Boolean);
      } else if (typeof rawEmails === 'string') {
        emailList = rawEmails.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
      }

      const contactPerson = (r.contact_person || r['Contact Person'] || r['Contact'] || r['Faculty Name'] || 'Institutional Coordinator').trim();
      const designation = (r.designation || r['Designation'] || 'Placement & Outreach Officer').trim();
      const department = (r.department || r['Department'] || 'Training & Placement').trim();

      emailList.forEach((em, idx) => {
        const contactId = `cnt_${Date.now()}_${i}_${idx}`;
        insertContact.run(
          contactId,
          collegeId,
          contactPerson,
          designation,
          department,
          em.trim(),
          em.trim().toLowerCase(),
          phone || null,
          'generic',
          idx === 0 ? 1 : 0,
          now
        );
        contactsImported++;
      });
    }
    db.exec('COMMIT;');
    return { success: true, collegesImported, contactsImported };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * ----------------------------------------------------
 * CAMPAIGN & TRACKING HELPERS
 * ----------------------------------------------------
 */

export function createCampaignRecord({
  id,
  name,
  subject,
  templateId,
  bodyHtml,
  bodyText,
  targetCountries = [],
  targetStates = [],
  selectedCollegesCount = 0,
  totalRecipients = 0,
  trackOpens = 1,
  trackClicks = 1,
  attachments = [],
  createdBy = 'system'
}) {
  const db = getDb();
  const campaignId = id || 'cmp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO campaigns (
      id, name, subject, template_id, body_html, body_text,
      target_countries, target_states, selected_colleges_count, total_recipients,
      queued_count, accepted_count, failed_count, opened_count, clicked_count,
      status, track_opens, track_clicks, attachments, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'QUEUED', ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    name,
    subject,
    templateId || null,
    bodyHtml,
    bodyText || null,
    JSON.stringify(targetCountries),
    JSON.stringify(targetStates),
    selectedCollegesCount,
    totalRecipients,
    totalRecipients,
    trackOpens ? 1 : 0,
    trackClicks ? 1 : 0,
    typeof attachments === 'string' ? attachments : JSON.stringify(attachments || []),
    createdBy,
    now
  );

  return campaignId;
}

export function updateCampaignCounters(campaignId) {
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
      FROM outreach_logs
      WHERE campaign_id = ?
    `).get(campaignId);

    if (stats) {
      let status = 'COMPLETED';
      if ((stats.pending || 0) + (stats.processing || 0) > 0) {
        status = 'PROCESSING';
      } else if (stats.failed > 0 && stats.accepted > 0) {
        status = 'PARTIAL';
      } else if (stats.failed > 0 && stats.accepted === 0) {
        status = 'FAILED';
      }

      db.prepare(`
        UPDATE campaigns
        SET total_recipients = ?,
            queued_count = ?,
            accepted_count = ?,
            failed_count = ?,
            opened_count = ?,
            clicked_count = ?,
            status = ?,
            completed_at = CASE WHEN ? IN ('COMPLETED', 'PARTIAL', 'FAILED') THEN ? ELSE completed_at END
        WHERE id = ?
      `).run(
        stats.total || 0,
        (stats.pending || 0) + (stats.processing || 0),
        stats.accepted || 0,
        stats.failed || 0,
        stats.opened || 0,
        stats.clicked || 0,
        status,
        status,
        new Date().toISOString(),
        campaignId
      );
    }
  } catch (err) {
    console.error('[Database] updateCampaignCounters error:', err);
  }
}

export function getCampaignList({ limit = 50, offset = 0, status = 'all' }) {
  const db = getDb();
  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (status !== 'all') {
      where += ' AND status = ?';
      params.push(status);
    }

    const totalRow = db.prepare(`SELECT COUNT(*) as cnt FROM campaigns ${where}`).get(...params);
    const total = totalRow ? totalRow.cnt : 0;

    const campaigns = db.prepare(`
      SELECT id, name, subject, template_id, target_countries, target_states,
             selected_colleges_count, total_recipients, queued_count, accepted_count,
             failed_count, opened_count, clicked_count, status, track_opens, track_clicks,
             created_by, created_at, completed_at
      FROM campaigns
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { total, campaigns };
  } catch (err) {
    console.error('[Database] getCampaignList error:', err);
    return { total: 0, campaigns: [] };
  }
}

export function getCampaignDetails(campaignId) {
  const db = getDb();
  try {
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(campaignId);
    if (!campaign) return null;

    // Recalculate up to date counts
    updateCampaignCounters(campaignId);
    return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(campaignId);
  } catch (err) {
    console.error('[Database] getCampaignDetails error:', err);
    return null;
  }
}

export function getCampaignRecipientLogs(campaignId, { search = '', status = 'all', country = '', state = '', limit = 50, offset = 0 }) {
  const db = getDb();
  try {
    let where = 'WHERE campaign_id = ?';
    const params = [campaignId];

    if (status !== 'all') {
      if (status === 'opened') {
        where += ' AND opened_at IS NOT NULL';
      } else if (status === 'clicked') {
        where += ' AND clicked_at IS NOT NULL';
      } else {
        where += ' AND status = ?';
        params.push(status);
      }
    }

    if (search.trim()) {
      const wild = `%${search.trim()}%`;
      where += ' AND (college_name LIKE ? OR email LIKE ? OR contact_person LIKE ?)';
      params.push(wild, wild, wild);
    }

    if (country) {
      where += ' AND country = ?';
      params.push(country);
    }

    if (state) {
      where += ' AND state = ?';
      params.push(state);
    }

    const totalRow = db.prepare(`SELECT COUNT(*) as cnt FROM outreach_logs ${where}`).get(...params);
    const total = totalRow ? totalRow.cnt : 0;

    const records = db.prepare(`
      SELECT id, college_name, email, department, contact_person, designation, subject,
             status, failure_type, error_message, smtp_response, attempts, sent_by,
             created_at, sent_at, country, state, tracking_token, opened_at, open_count,
             clicked_at, click_count, last_clicked_url, delivery_status
      FROM outreach_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { total, records };
  } catch (err) {
    console.error('[Database] getCampaignRecipientLogs error:', err);
    return { total: 0, records: [] };
  }
}

export function recordEmailTrackingEvent({
  outreachId,
  campaignId,
  eventType,
  recipientEmail,
  userAgent,
  ipAddress,
  targetUrl
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const eventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  try {
    db.prepare(`
      INSERT INTO email_tracking_events (
        id, outreach_id, campaign_id, event_type, recipient_email, user_agent, ip_address, target_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, outreachId, campaignId || null, eventType, recipientEmail, userAgent || null, ipAddress || null, targetUrl || null, now);

    if (eventType === 'OPEN') {
      db.prepare(`
        UPDATE outreach_logs
        SET open_count = open_count + 1,
            opened_at = COALESCE(opened_at, ?)
        WHERE id = ?
      `).run(now, outreachId);
    } else if (eventType === 'CLICK') {
      db.prepare(`
        UPDATE outreach_logs
        SET click_count = click_count + 1,
            clicked_at = COALESCE(clicked_at, ?),
            last_clicked_url = ?
        WHERE id = ?
      `).run(now, targetUrl || null, outreachId);
    }

    if (campaignId) {
      updateCampaignCounters(campaignId);
    }

    return { success: true };
  } catch (err) {
    console.error('[Database] recordEmailTrackingEvent error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * ----------------------------------------------------
 * IMAGE & MEDIA ASSET HELPERS
 * ----------------------------------------------------
 */

export function getMediaImages(category = 'all') {
  const db = getDb();
  try {
    if (category && category !== 'all') {
      return db.prepare(`SELECT * FROM uploaded_images WHERE category = ? ORDER BY created_at DESC`).all(category);
    }
    return db.prepare(`SELECT * FROM uploaded_images ORDER BY created_at DESC`).all();
  } catch (err) {
    console.error('[Database] getMediaImages error:', err);
    return [];
  }
}

export function saveMediaImage({ id, filename, originalName, mimeType, sizeBytes, url, category = 'general', uploadedBy = 'system' }) {
  const db = getDb();
  const imgId = id || 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO uploaded_images (id, filename, original_name, mime_type, size_bytes, url, category, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(imgId, filename, originalName, mimeType, sizeBytes, url, category, uploadedBy, now);

  return { id: imgId, url, filename };
}

export function deleteMediaImage(id) {
  const db = getDb();
  try {
    const row = db.prepare(`SELECT filename, url FROM uploaded_images WHERE id = ?`).get(id);
    if (!row) return { success: false, error: 'Image not found' };

    db.prepare(`DELETE FROM uploaded_images WHERE id = ?`).run(id);
    return { success: true, filename: row.filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
