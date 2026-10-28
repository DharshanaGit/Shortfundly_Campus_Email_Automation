from datetime import datetime
import json
from automation_engine.scheduler.celery_app import app
from automation_engine.crawler.college_crawler import CollegeCrawler
from automation_engine.extractor.contact_extractor import ContactExtractor
from automation_engine.missing_resolver.website_resolver import MissingWebsiteResolver
from automation_engine.db.db_manager import (
    get_connection,
    update_college_website,
    upsert_contacts_bulk,
    get_colleges_missing_website
)

@app.task(name="automation_engine.scheduler.tasks.crawl_and_verify_single_college")
def crawl_and_verify_single_college(college_id, college_name, website_url, district, state):
    """Celery task to crawl, extract, and verify contacts for a single college."""
    crawler = CollegeCrawler()
    extractor = ContactExtractor()
    try:
        pages = crawler.crawl_college_website(website_url)
        contacts = extractor.process_crawled_data(college_id, college_name, district, state, pages)
        if contacts:
            upsert_contacts_bulk(contacts)
        return {"college_id": college_id, "contacts_found": len(contacts)}
    finally:
        crawler.close()

@app.task(name="automation_engine.scheduler.tasks.monthly_full_audit_and_delta_monitor")
def monthly_full_audit_and_delta_monitor():
    """
    Automated Monthly Job:
    1. Audits missing websites and resolves them using Brave Search & domain matching.
    2. Re-crawls all official college websites.
    3. Detects changes (new contacts, updated roles) and logs them into change_audit_logs.
    """
    print(f"[Monthly Scheduler] Starting automated Pan-India audit & delta crawl at {datetime.now()}...")
    
    # 1. Resolve missing websites
    resolver = MissingWebsiteResolver()
    missing = get_colleges_missing_website(limit=500)
    for c in missing:
        found_url, ok = resolver.resolve_website(c["id"], c["college_name"], c["district"], c["state"])
        if ok and found_url:
            update_college_website(c["id"], found_url, is_verified=True)
    resolver.close()

    # 2. Delta Crawl & Change Monitoring
    crawler = CollegeCrawler()
    extractor = ContactExtractor()
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, college_name, website_url, district, state
                FROM colleges
                WHERE website_url IS NOT NULL AND website_url != ''
                LIMIT 1000;
            """)
            colleges = cur.fetchall()

    for col in colleges:
        try:
            pages = crawler.crawl_college_website(col["website_url"])
            new_contacts = extractor.process_crawled_data(col["id"], col["college_name"], col["district"], col["state"], pages)
            
            # Fetch existing contacts to detect delta changes (only new or updated contacts)
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT target_email, role, contact_person, phone FROM college_contacts WHERE college_id = %s", (col["id"],))
                    existing = {row["target_email"]: row for row in cur.fetchall()}

                    delta_to_upsert = []
                    for nc in new_contacts:
                        email = nc["target_email"]
                        if email not in existing:
                            # 1. Newly discovered email not previously in database
                            cur.execute("""
                                INSERT INTO change_audit_logs (college_id, change_type, old_value, new_value)
                                VALUES (%s, 'NEW_CONTACT_DISCOVERED', NULL, %s);
                            """, (col["id"], json.dumps(nc)))
                            delta_to_upsert.append(nc)
                        else:
                            # 2. Existing email: check if role, person, or phone changed
                            old = existing[email]
                            role_changed = old.get("role") != nc.get("role")
                            person_changed = old.get("contact_person") != nc.get("contact_person") and nc.get("contact_person")
                            phone_changed = old.get("phone") != nc.get("phone") and nc.get("phone")

                            if role_changed or person_changed or phone_changed:
                                cur.execute("""
                                    INSERT INTO change_audit_logs (college_id, change_type, old_value, new_value)
                                    VALUES (%s, 'UPDATED_ROLE', %s, %s);
                                """, (col["id"], json.dumps(old), json.dumps(nc)))
                                delta_to_upsert.append(nc)

            # Upsert only genuinely new or updated contacts, leaving already loaded unchanged contacts intact
            if delta_to_upsert:
                upsert_contacts_bulk(delta_to_upsert)
        except Exception as e:
            print(f"[Monthly Task] Error processing college {col['college_name']}: {e}")

    crawler.close()
    print("[Monthly Scheduler] Automated monthly audit completed successfully.")
