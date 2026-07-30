import urllib.request, re

# Check /settings for what's actually served
resp = urllib.request.urlopen("https://stock.etdledger.com/settings")
html = resp.read().decode()
# Look for the root div
if 'id="root"' in html:
    print("SPA index.html served at /settings")
    # Check for error message
    if "NotFoundPage" in html or "not-found" in html.lower():
        print("BUT the React app shows the NotFoundPage")
    else:
        print("React app loaded - likely renders SettingsPage")
else:
    print("NOT SPA. First 500 chars:", html[:500])
