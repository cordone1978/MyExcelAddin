Quotation System Client Test Package (Windows)

Files
1. setup-client-test.bat
   - Run as Administrator
   - Updates hosts + imports test certificate + opens browser verification pages
2. manifest.xml
   - Test manifest (points to quotation-vm.test:3001)
   - Used by IT/admin for shared folder catalog, or sideload fallback
3. quotation-vm.test.cer (or .pem)
   - Test certificate (public cert only)

Recommended user flow (shared folder catalog)
1. Run setup-client-test.bat as Administrator
2. Input the current test server IP (press Enter to use default)
3. Confirm these pages open in browser:
   - https://quotation-vm.test:3001/api/test
   - https://quotation-vm.test:3001/taskpane.html
4. Open Excel -> Insert -> My Add-ins
5. Open Quotation System from the shared folder catalog configured by IT/admin

Fallback (manual sideload, only if shared folder catalog is not configured)
- Use the included manifest.xml to sideload in Excel

Notes
- If the test server IP changes, rerun setup-client-test.bat and enter the new IP
- If browser/Excel still shows certificate warning, restart browser/Excel after setup
