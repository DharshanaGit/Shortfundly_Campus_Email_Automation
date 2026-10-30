import httpx
from bs4 import BeautifulSoup
import urllib.parse
import re
from automation_engine.config import USER_AGENT, REQUEST_TIMEOUT

TARGET_ROUTE_KEYWORDS = [
    "contact", "contactus", "contact-us", "reach-us", "reachus", "about", "about-us", "aboutus",
    "principal", "director", "leadership", "administration", "governance", "management",
    "tpo", "placement", "placements", "career", "training", "training-placement",
    "faculty", "staff", "iqac", "departments", "academics", "people", "directory",
    "dean", "hod", "registrar", "office", "controller", "examination"
]

class CollegeCrawler:
    def __init__(self):
        self.headers = {"User-Agent": USER_AGENT}
        self.client = httpx.Client(timeout=REQUEST_TIMEOUT, verify=False, follow_redirects=True)

    def crawl_college_website(self, base_url, max_subpages=12):
        """
        Crawls the institutional homepage and target subpages (/contact, /placement, /faculty, /principal).
        Returns a dictionary of crawled pages with their HTML and text content.
        """
        if not base_url:
            return {}

        parsed_base = urllib.parse.urlparse(base_url)
        base_domain = parsed_base.netloc.lower()
        if not parsed_base.scheme:
            base_url = f"https://{base_url}"
            parsed_base = urllib.parse.urlparse(base_url)
            base_domain = parsed_base.netloc.lower()

        crawled_pages = {}
        pages_to_visit = [base_url]
        visited = set()

        print(f"[Crawler] Commencing deep crawl of: {base_url}...")

        while pages_to_visit and len(visited) < max_subpages:
            url = pages_to_visit.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                resp = self.client.get(url, headers=self.headers)
                if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", ""):
                    soup = BeautifulSoup(resp.text, "lxml")
                    # Remove scripts and style elements
                    for s in soup(["script", "style", "noscript", "svg"]):
                        s.decompose()

                    text = soup.get_text(separator=" ", strip=True)
                    crawled_pages[url] = {
                        "html": resp.text,
                        "text": text,
                        "soup": soup
                    }

                    # Find candidate internal links for placements, contacts, leadership
                    if len(visited) == 1: # Only discover links from homepage
                        for a in soup.find_all("a", href=True):
                            href = a["href"].strip()
                            resolved = urllib.parse.urljoin(base_url, href)
                            p = urllib.parse.urlparse(resolved)
                            # Must remain on same domain
                            if p.netloc.lower() == base_domain:
                                path_lower = p.path.lower()
                                if any(kw in path_lower for kw in TARGET_ROUTE_KEYWORDS):
                                    if resolved not in visited and resolved not in pages_to_visit:
                                        pages_to_visit.append(resolved)
            except Exception as e:
                # Silently catch network drops on secondary pages
                pass

        print(f"[Crawler] Completed crawl of {base_url}. Visited {len(crawled_pages)} pages.")
        return crawled_pages

    def close(self):
        self.client.close()
