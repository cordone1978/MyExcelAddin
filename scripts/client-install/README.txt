Quotation Client Installer Package (One-Click v1.3)

Files
1. install-client.bat
   - Run as Administrator
   - Launches PowerShell one-click installer
2. install-client.ps1
   - Updates hosts
   - Imports root CA certificate
   - Verifies HTTPS endpoints and shared folder
   - Attempts registry configuration for Excel shared add-in catalog
   - Opens browser, shared folder, and Excel
3. config.json
   - Environment settings (host, port, default IP, share path, smbUsername, smbPassword)
4. quotation-company-root.cer (or rootCA.cer/rootCA.pem)
   - Root CA certificate for client trust
5. manifest.xml (optional fallback)
   - Manual sideload fallback only

Usage
1. Right-click install-client.bat and choose Run as administrator
2. Run installer (server IP is read from config.json by default)
3. Wait for installer checks to complete
4. Restart Excel if already open, then open Quotation System from Shared Folder catalog

Notes
- If server IP changes, update config.json and rerun installer
- To change host/port/share path defaults, edit config.json (do not edit script)
- If shared catalog is not visible in Excel, use manifest.xml as fallback sideload
