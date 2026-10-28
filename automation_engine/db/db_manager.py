import psycopg
from psycopg.rows import dict_row
from pathlib import Path
from automation_engine.config import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
)

INDIAN_STATES_AND_UTS = [
    ("AN", "Andaman and Nicobar Islands"),
    ("AP", "Andhra Pradesh"),
    ("AR", "Arunachal Pradesh"),
    ("AS", "Assam"),
    ("BR", "Bihar"),
    ("CH", "Chandigarh"),
    ("CG", "Chhattisgarh"),
    ("DH", "Dadra and Nagar Haveli and Daman and Diu"),
    ("DL", "Delhi"),
    ("GA", "Goa"),
    ("GJ", "Gujarat"),
    ("HR", "Haryana"),
    ("HP", "Himachal Pradesh"),
    ("JK", "Jammu and Kashmir"),
    ("JH", "Jharkhand"),
    ("KA", "Karnataka"),
    ("KL", "Kerala"),
    ("LA", "Ladakh"),
    ("LD", "Lakshadweep"),
    ("MP", "Madhya Pradesh"),
    ("MH", "Maharashtra"),
    ("MN", "Manipur"),
    ("ML", "Meghalaya"),
    ("MZ", "Mizoram"),
    ("NL", "Nagaland"),
    ("OD", "Odisha"),
    ("PY", "Puducherry"),
    ("PB", "Punjab"),
    ("RJ", "Rajasthan"),
    ("SK", "Sikkim"),
    ("TN", "Tamil Nadu"),
    ("TS", "Telangana"),
    ("TR", "Tripura"),
    ("UP", "Uttar Pradesh"),
    ("UK", "Uttarakhand"),
    ("WB", "West Bengal")
]

def get_connection(autocommit=True):
    """Establishes connection to PostgreSQL using psycopg3 with dictionary row factory."""
    conn = psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        connect_timeout=3,
        options="-c search_path=college_data,public",
        row_factory=dict_row
    )
    conn.autocommit = autocommit
    return conn

def init_db():
    """Initializes the database schema and seeds all Indian States and UTs."""
    schema_path = Path(__file__).resolve().parent / "postgres_schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            # Seed states
            for code, name in INDIAN_STATES_AND_UTS:
                cur.execute(
                    """
                    INSERT INTO states (state_code, state_name)
                    VALUES (%s, %s)
                    ON CONFLICT (state_code) DO NOTHING;
                    """,
                    (code, name)
                )
    print("[DB Manager] Schema initialized and 36 States/UTs verified.")

def upsert_colleges_bulk(colleges_list):
    """Bulk upserts colleges into PostgreSQL."""
    if not colleges_list:
        return 0
    query = """
    INSERT INTO colleges (
        aishe_code, ugc_id, aicte_id, college_name, state, district,
        location, affiliating_university, category, website_url,
        website_status, is_website_verified, phone, address, source
    ) VALUES (
        %(aishe_code)s, %(ugc_id)s, %(aicte_id)s, %(college_name)s, %(state)s, %(district)s,
        %(location)s, %(affiliating_university)s, %(category)s, %(website_url)s,
        %(website_status)s, %(is_website_verified)s, %(phone)s, %(address)s, %(source)s
    )
    ON CONFLICT (aishe_code) DO UPDATE SET
        college_name = EXCLUDED.college_name,
        state = EXCLUDED.state,
        district = EXCLUDED.district,
        website_url = COALESCE(NULLIF(EXCLUDED.website_url, ''), colleges.website_url),
        is_website_verified = EXCLUDED.is_website_verified OR colleges.is_website_verified,
        updated_at = CURRENT_TIMESTAMP;
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(query, colleges_list)
    return len(colleges_list)

def get_colleges_missing_website(state=None, limit=200):
    """Retrieves colleges that have no website or unverified website."""
    query = """
    SELECT id, aishe_code, college_name, state, district, location
    FROM colleges
    WHERE (website_url IS NULL OR website_url = '' OR is_website_verified = FALSE)
    """
    params = []
    if state:
        query += " AND state ILIKE %s"
        params.append(state)
    query += " ORDER BY college_name ASC LIMIT %s;"
    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

def update_college_website(college_id, website_url, is_verified=True, status="ACTIVE"):
    """Updates the resolved website for a college."""
    query = """
    UPDATE colleges
    SET website_url = %s,
        is_website_verified = %s,
        website_status = %s,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = %s;
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (website_url, is_verified, status, college_id))

def upsert_contacts_bulk(contacts_list):
    """Bulk upserts verified contacts into PostgreSQL, resolving college_id UUIDs."""
    if not contacts_list:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Pre-fetch college map (name -> id, and aishe_code -> id)
            cur.execute("SELECT id, college_name, aishe_code FROM colleges;")
            college_map = {}
            for r in cur.fetchall():
                if r.get('college_name'):
                    college_map[r['college_name'].strip().lower()] = r['id']
                if r.get('aishe_code'):
                    college_map[r['aishe_code'].strip().lower()] = r['id']

            sanitized_contacts = []
            seen_emails = set()
            for c in contacts_list:
                email = (c.get('target_email') or '').strip().lower()
                if not email or email in seen_emails:
                    continue
                seen_emails.add(email)

                # Resolve UUID
                col_id = c.get('college_id')
                if not col_id or str(col_id).startswith('AISHE-') or str(col_id).startswith('UGC-'):
                    col_name = (c.get('college_name') or '').strip().lower()
                    code = str(col_id or '').strip().lower()
                    col_id = college_map.get(col_name) or college_map.get(code)

                sanitized_contacts.append({
                    "college_id": col_id,
                    "college_name": c.get('college_name') or 'Higher Education Institution',
                    "target_email": email,
                    "role": c.get('role') or 'Administrative / Office',
                    "district_location": c.get('district_location') or '',
                    "contact_person": c.get('contact_person'),
                    "phone": c.get('phone'),
                    "email_syntax_valid": c.get('email_syntax_valid', True),
                    "dns_mx_verified": c.get('dns_mx_verified', False),
                    "verification_status": c.get('verification_status', 'VERIFIED_MX'),
                    "confidence_score": c.get('confidence_score', 1.0)
                })

            if not sanitized_contacts:
                return 0

            # Delta Analysis: Detect genuine new and updated emails vs already loaded records
            existing_emails_set = set()
            existing_records = {}
            try:
                email_list = [c['target_email'] for c in sanitized_contacts]
                cur.execute("SELECT target_email, role, contact_person, phone FROM college_contacts WHERE target_email = ANY(%s);", (email_list,))
                for row in cur.fetchall():
                    em = row['target_email'].strip().lower()
                    existing_emails_set.add(em)
                    existing_records[em] = row
            except Exception as e:
                print(f"[DB Delta Audit] Pre-check note: {e}")

            new_discovered = 0
            updated_roles = 0
            skipped_count = 0

            for c in sanitized_contacts:
                em = c['target_email']
                if em not in existing_emails_set:
                    new_discovered += 1
                    try:
                        cur.execute("""
                            INSERT INTO change_audit_logs (college_id, change_type, old_value, new_value)
                            VALUES (%s, 'NEW_CONTACT_DISCOVERED', NULL, %s);
                        """, (c.get('college_id'), json.dumps(c)))
                    except Exception:
                        pass
                else:
                    old = existing_records.get(em, {})
                    role_changed = old.get('role') != c.get('role')
                    person_changed = old.get('contact_person') != c.get('contact_person') and c.get('contact_person')
                    phone_changed = old.get('phone') != c.get('phone') and c.get('phone')
                    if role_changed or person_changed or phone_changed:
                        updated_roles += 1
                        try:
                            cur.execute("""
                                INSERT INTO change_audit_logs (college_id, change_type, old_value, new_value)
                                VALUES (%s, 'UPDATED_ROLE', %s, %s);
                            """, (c.get('college_id'), json.dumps(old), json.dumps(c)))
                        except Exception:
                            pass
                    else:
                        skipped_count += 1

            query = """
            INSERT INTO college_contacts (
                college_id, college_name, target_email, role, district_location,
                contact_person, phone, email_syntax_valid, dns_mx_verified,
                verification_status, confidence_score
            ) VALUES (
                %(college_id)s, %(college_name)s, %(target_email)s, %(role)s, %(district_location)s,
                %(contact_person)s, %(phone)s, %(email_syntax_valid)s, %(dns_mx_verified)s,
                %(verification_status)s, %(confidence_score)s
            )
            ON CONFLICT (target_email) DO UPDATE SET
                college_id = COALESCE(EXCLUDED.college_id, college_contacts.college_id),
                college_name = EXCLUDED.college_name,
                role = EXCLUDED.role,
                district_location = EXCLUDED.district_location,
                contact_person = COALESCE(EXCLUDED.contact_person, college_contacts.contact_person),
                phone = COALESCE(EXCLUDED.phone, college_contacts.phone),
                dns_mx_verified = EXCLUDED.dns_mx_verified,
                verification_status = EXCLUDED.verification_status,
                updated_at = CURRENT_TIMESTAMP;
            """
            cur.executemany(query, sanitized_contacts)
            print(f"[DB Manager] Delta sync finished: {new_discovered} newly discovered, {updated_roles} updated, {skipped_count} already loaded (skipped duplicate work).")
            return len(sanitized_contacts)

def get_contacts_by_state(state_name, role=None, limit=5000):
    """
    Fetches verified contacts for a specific state (or all states) for immediate email outreach.
    Returns: college_name, target_email, role, district_location, contact_person, phone.
    """
    query = """
    SELECT 
        c.college_name,
        cc.target_email,
        cc.role,
        COALESCE(cc.district_location, c.district || ', ' || c.state) AS district_location,
        COALESCE(cc.contact_person, 'Principal / Leadership Office') AS contact_person,
        COALESCE(cc.phone, c.phone, '') AS phone,
        cc.verification_status
    FROM college_contacts cc
    JOIN colleges c ON cc.college_id = c.id
    """
    params = []
    where_clauses = []

    if state_name and state_name.lower() not in ("all india", "all", "india"):
        where_clauses.append("c.state ILIKE %s")
        params.append(f"%{state_name}%")

    if role and role != "ALL":
        where_clauses.append("cc.role ILIKE %s")
        params.append(f"%{role}%")

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " ORDER BY c.college_name ASC LIMIT %s;"
    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
