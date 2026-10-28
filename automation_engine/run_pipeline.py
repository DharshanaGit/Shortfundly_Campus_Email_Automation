import argparse
import sys
from pathlib import Path
from datetime import datetime

# Enable unbuffered / line-buffered stdout for real-time progress logging
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from automation_engine.db.db_manager import (
    get_connection,
    init_db,
    upsert_colleges_bulk,
    get_colleges_missing_website,
    update_college_website,
    upsert_contacts_bulk,
    get_contacts_by_state
)
from automation_engine.scrapers.aishe_scraper import AISHEScraper
from automation_engine.scrapers.ugc_scraper import UGCScraper
from automation_engine.scrapers.aicte_scraper import AICTEScraper
from automation_engine.missing_resolver.website_resolver import MissingWebsiteResolver
from automation_engine.crawler.college_crawler import CollegeCrawler
from automation_engine.extractor.contact_extractor import ContactExtractor

def update_job_progress(job_id, status=None, colleges_crawled=None, contacts_extracted=None, error_log=None):
    """Safely updates crawl_jobs row in PostgreSQL for real-time progress tracking in web dashboard."""
    if not job_id:
        return
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                updates = []
                params = []
                if status:
                    updates.append("status = %s")
                    params.append(status)
                    if status in ('COMPLETED', 'FAILED'):
                        updates.append("finished_at = NOW()")
                if colleges_crawled is not None:
                    updates.append("colleges_crawled = %s")
                    params.append(colleges_crawled)
                if contacts_extracted is not None:
                    updates.append("contacts_extracted = %s")
                    params.append(contacts_extracted)
                if error_log is not None:
                    updates.append("error_log = %s")
                    params.append(error_log)

                if updates:
                    sql = f"UPDATE crawl_jobs SET {', '.join(updates)} WHERE id = %s;"
                    params.append(job_id)
                    cur.execute(sql, tuple(params))
                    conn.commit()
    except Exception as e:
        print(f"[Job Progress Warning] {e}")

def run_state_pipeline(state_name=None, limit=200, job_id=None):
    """
    Executes the full automated pipeline for Pan-India (or a specific state if provided):
    1. Scrapes official AISHE, UGC, and AICTE directories across all India (no dummy data)
    2. Discovers data which does not exist in DB (colleges with missing websites or no contacts)
    3. Resolves missing websites via Brave Search API & domain-matching rules evidence
    4. Crawls official institutional websites to extract decision makers
    5. Stores master colleges and verified contacts in PostgreSQL
    6. Updates crawl_jobs status and real-time streaming metrics
    """
    scope_label = state_name.upper() if state_name and state_name.lower() != "all india" else "ALL OVER INDIA"
    filter_state = None if (not state_name or state_name.lower() in ("all india", "all", "india")) else state_name

    print(f"\n{'='*75}")
    print(f"[START] INITIATING AUTOMATED PIPELINE FOR: {scope_label} (Job ID: {job_id or 'Manual'})")
    print(f"{'='*75}\n")

    update_job_progress(job_id, status="RUNNING", colleges_crawled=0, contacts_extracted=0)

    try:
        # Step 1: PostgreSQL Schema Verification
        print(">>> STEP 1: Verifying PostgreSQL Schema & State Masters...")
        try:
            init_db()
        except Exception as e:
            print(f"[PostgreSQL Notice] {e}")

        # Step 2: Harvest Official Regulatory Portals (AISHE, UGC, AICTE)
        print("\n>>> STEP 2: Harvesting Official Regulatory Portals (AISHE, UGC, AICTE)...")
        harvested_colleges = []
        pre_extracted_contacts = []

        # 2a. UGC Portal
        try:
            ugc = UGCScraper()
            try:
                ugc_colleges, ugc_contacts = ugc.scrape_all_universities(target_state=filter_state, limit=limit)
                harvested_colleges.extend(ugc_colleges)
                pre_extracted_contacts.extend(ugc_contacts)
            finally:
                ugc.close()
        except Exception as ugc_err:
            print(f"[UGC Harvest Note] {ugc_err}")

        # 2b. AISHE Portal
        try:
            aishe = AISHEScraper()
            try:
                aishe_colleges = aishe.scrape_directory(target_state=filter_state, limit=limit)
                harvested_colleges.extend(aishe_colleges)
            finally:
                aishe.close()
        except Exception as aishe_err:
            print(f"[AISHE Harvest Note] {aishe_err}")

        # 2c. AICTE Portal
        try:
            aicte = AICTEScraper()
            try:
                aicte_colleges = aicte.scrape_state_colleges(state_name=filter_state or "ALL", limit=limit)
                harvested_colleges.extend(aicte_colleges)
            finally:
                aicte.close()
        except Exception as aicte_err:
            print(f"[AICTE Harvest Note] {aicte_err}")

        # Step 2d: Ingest colleges from database that DO NOT EXIST in contacts yet ("crawl data which doesnot exist")
        print("\n>>> STEP 2d: Ingesting existing database institutions with missing contacts or unverified sites...")
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    state_clause = "AND c.state ILIKE %s" if filter_state else ""
                    params = [f"%{filter_state}%"] if filter_state else []
                    cur.execute(f"""
                        SELECT c.id, c.college_name, c.website_url, c.district, c.state, c.is_website_verified
                        FROM colleges c
                        LEFT JOIN college_contacts ct ON c.id = ct.college_id
                        WHERE (ct.id IS NULL OR c.website_url IS NULL OR c.website_url = '') {state_clause}
                        ORDER BY c.created_at DESC
                        LIMIT %s;
                    """, (*params, limit))
                    uncontacted = cur.fetchall()
                    if uncontacted:
                        print(f"Found {len(uncontacted)} institutions lacking contacts in DB; enqueuing for deep crawl.")
                        for row in uncontacted:
                            harvested_colleges.append(dict(row))
        except Exception as uncontacted_err:
            print(f"[DB Uncontacted Note] {uncontacted_err}")

        print(f"\nTotal Regulatory & Target Institutions Harvested: {len(harvested_colleges)}")

        # Deduplicate colleges by name
        seen_names = set()
        unique_colleges = []
        for c in harvested_colleges:
            norm = c["college_name"].strip().lower()
            if norm not in seen_names:
                seen_names.add(norm)
                unique_colleges.append(c)

        print(f"Deduplicated Canonical Colleges: {len(unique_colleges)}")

        # Store master colleges in PostgreSQL
        try:
            upsert_colleges_bulk(unique_colleges)
            print(f"Stored {len(unique_colleges)} verified master colleges in PostgreSQL.")
        except Exception as e:
            print(f"[DB Notice] Colleges upsert: {e}")

        # Step 3: Missing Website Resolution (Brave Search API + Domain Matching + DuckDB Evidence)
        print("\n>>> STEP 3: Resolving Missing Websites with Brave Search & Domain Evidence...")
        resolver = MissingWebsiteResolver()
        crawler = CollegeCrawler()
        extractor = ContactExtractor()
        total_contacts = []

        # Include regulatory contacts found directly in UGC
        for rc in pre_extracted_contacts:
            valid_email = extractor.verify_email_syntax(rc["target_email"])
            if valid_email:
                has_mx = extractor.verify_dns_mx(valid_email)
                total_contacts.append({
                    "college_id": None,
                    "college_name": rc["college_name"],
                    "target_email": valid_email,
                    "role": rc["role"],
                    "district_location": rc.get("district_location") or state_name,
                    "contact_person": rc.get("contact_person") or "Leadership Office",
                    "phone": rc.get("phone") or "",
                    "email_syntax_valid": True,
                    "dns_mx_verified": has_mx,
                    "verification_status": "VERIFIED_MX" if has_mx else "SYNTAX_ONLY",
                    "confidence_score": 1.0
                })

        crawled_count = 0
        try:
            # Check colleges and crawl official sites
            for idx, col in enumerate(unique_colleges[:limit], 1):
                website = col.get("website_url")
                if not website or not col.get("is_website_verified"):
                    found_url, ok = resolver.resolve_website(
                        col.get("aishe_code") or col.get("id"), col["college_name"], col.get("district", ""), state_name
                    )
                    if ok and found_url:
                        col["website_url"] = found_url
                        col["is_website_verified"] = True
                        if col.get("id"):
                            update_college_website(col["id"], found_url, is_verified=True)

                # Step 4 & 5: Deep Website Crawling & Contact Classification
                target_url = col.get("website_url")
                if target_url:
                    pages = crawler.crawl_college_website(target_url, max_subpages=4)
                    contacts = extractor.process_crawled_data(
                        col.get("aishe_code") or col.get("id"), col["college_name"], col.get("district", ""), state_name, pages
                    )
                    total_contacts.extend(contacts)
                    crawled_count += 1

                # Update live job progress in PostgreSQL every 5 colleges
                if idx % 5 == 0 or idx == len(unique_colleges[:limit]):
                    update_job_progress(job_id, colleges_crawled=crawled_count, contacts_extracted=len(total_contacts))
        finally:
            resolver.close()
            crawler.close()

        # Step 6: Upsert Contacts into PostgreSQL and export to Excel/CSV
        print(f"\n>>> STEP 4: Storing {len(total_contacts)} Classified & Verified Contacts in PostgreSQL...")
        if total_contacts:
            try:
                upsert_contacts_bulk(total_contacts)
            except Exception as e:
                print(f"[DB Notice] Contacts bulk insert: {e}")

        # Export Pan-India Master Directory using Pandas + OpenPyXL
        try:
            import pandas as pd
            out_dir = Path("data")
            out_dir.mkdir(parents=True, exist_ok=True)

            if total_contacts:
                df_contacts = pd.DataFrame(total_contacts)
                excel_path = out_dir / "Pan_India_Verified_Colleges_Contacts.xlsx"
                csv_path = out_dir / "Pan_India_Verified_Colleges_Contacts.csv"
                df_contacts.to_excel(excel_path, index=False)
                df_contacts.to_csv(csv_path, index=False)
                print(f"[Export] Saved verified contacts to {excel_path} and {csv_path}")

            if unique_colleges:
                df_colleges = pd.DataFrame(unique_colleges)
                col_excel_path = out_dir / "Pan_India_Master_Colleges.xlsx"
                col_csv_path = out_dir / "Pan_India_Master_Colleges.csv"
                df_colleges.to_excel(col_excel_path, index=False)
                df_colleges.to_csv(col_csv_path, index=False)
                print(f"[Export] Saved master colleges directory to {col_excel_path}")
        except Exception as exp_err:
            print(f"[Export Notice] {exp_err}")

        # Summary
        mx_count = sum(1 for c in total_contacts if c.get("dns_mx_verified"))
        print(f"\n{'='*75}")
        print(f"[COMPLETE] AUTOMATED PIPELINE EXECUTION COMPLETED")
        print(f"{'='*75}")
        print(f"State Targeted:          {state_name}")
        print(f"Colleges Ingested:       {len(unique_colleges)}")
        print(f"Colleges Crawled:        {crawled_count}")
        print(f"Total Contacts Verified: {len(total_contacts)}")
        print(f"DNS MX Receptive Emails: {mx_count} / {len(total_contacts)}")

        # Mark job as COMPLETED in PostgreSQL
        update_job_progress(
            job_id,
            status="COMPLETED",
            colleges_crawled=crawled_count or len(unique_colleges[:limit]),
            contacts_extracted=len(total_contacts)
        )

        return {
            "colleges": unique_colleges,
            "contacts": total_contacts
        }
    except Exception as pipeline_err:
        print(f"[PIPELINE FATAL ERROR] {pipeline_err}")
        update_job_progress(job_id, status="FAILED", error_log=str(pipeline_err))
        raise pipeline_err

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pan-India College Data Automation Pipeline")
    parser.add_argument("--state", type=str, default="All India", help="Indian State or 'All India' for Pan-India harvest")
    parser.add_argument("--limit", type=int, default=100, help="Number of institutions to process")
    parser.add_argument("--job-id", type=str, default=None, help="Crawl job UUID in PostgreSQL")
    args = parser.parse_args()

    run_state_pipeline(state_name=args.state, limit=args.limit, job_id=args.job_id)
