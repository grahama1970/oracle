#!/usr/bin/env python3
"""Check if GitHub cookies exist in Chrome profile and verify user is logged in."""

import sqlite3
import os
import stat
from pathlib import Path

def check_github_cookies():
    """Check for GitHub authentication cookies in Chrome's Default profile."""
    # Chrome cookie database path
    cookie_path = Path.home() / '.config/google-chrome/Default/Cookies'

    if not cookie_path.exists():
        print(f"❌ Chrome cookie database not found at {cookie_path}")
        return False

    try:
        # Copy the database to avoid lock issues
        temp_db = Path('/tmp/chrome_cookies_temp.db')
        temp_db.write_bytes(cookie_path.read_bytes())

        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()

        # Look for GitHub-related cookies
        cursor.execute("""
            SELECT name, value, host_key, is_secure, expires_utc
            FROM cookies
            WHERE host_key LIKE '%github.com%'
        """)

        github_cookies = cursor.fetchall()
        conn.close()
        temp_db.unlink()

        if not github_cookies:
            print("🚫 No GitHub cookies found in Chrome profile")
            return False

        print("🔍 Found GitHub cookies:")
        important_cookies = ['logged_in', 'user_session', '__Host-user_session_same_site', 'dotcom_user']

        has_github_session = False
        for cookie in github_cookies:
            name, value, host, secure, expires = cookie
            masked_value = value[:5] + '...' if len(value) > 5 else value
            print(f"  🍪 {name} on {host} = {masked_value}")

            if name in important_cookies and value:
                has_github_session = True

        if has_github_session:
            print("✅ GitHub appears to have a valid session!")
            return True
        else:
            print("⚠️  GitHub cookies found but no session detected")
            return False

    except Exception as e:
        print(f"❌ Error reading cookies: {e}")
        return False

if __name__ == '__main__':
    print("Checking Chrome profile for GitHub authentication...")
    has_auth = check_github_cookies()

    if not has_auth:
        print("\n🔐 To fix this:")
        print("1. Run: ./tmp/manual-github-login.sh")
        print("2. Log into GitHub when Chrome opens")
        print("3. Visit https://github.com/copilot/")
        print("4. Close the browser")
        print("5. Run this check again")