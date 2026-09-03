# Emergency codes on screen: an owner screen that shows the live emergency code for any till,

##  Emergency code admin screen

Today each till invents its own random emergency secret and seals it in Windows DPAPI /
Android Keystore. Nothing else in the world has a copy, so the only code you can produce
without the machine is the clock-only fallback, whose salt (`northwind-pos-emergency-v1`)
is shipped inside every APK, Electron bundle and browser build. Anyone who unpacks a build
can compute that code for every terminal you own. That is the real problem to fix.

### How it will work

```text
Till (first online moment)
   → wraps its emergency secret, sends it once to the POS server
        → server encrypts it with SETTINGS_ENCRYPTION_KEY and stores the ciphertext
Owner opens Settings → Emergency codes
   → picks the till (by name + 4-character fingerprint already shown on its lock screen)
        → server decrypts, derives the current 6-digit code, returns only the code
   → screen shows the code and the seconds left before it changes
```

The secret itself is never returned to the browser, never stored in plain text, and never
readable through the data API — only the server's own key can unwrap it.

### Screen

New page `Settings → Emergency codes` (`/settings/emergency-codes`), in the same group as
Terminal activation:

- one row per registered terminal: device name, branch, fingerprint, last seen, whether a
recovery secret has been escrowed yet
- "Show code" reveals a large 6-digit code with a countdown bar; it refreshes itself each
minute while open, and hides again after two minutes
- every reveal is written to the audit log (who, which terminal, when)
- restricted to owner/manager role, with a manager PIN confirmation before the first reveal

### Removing the shipped master salt

The product-wide fallback salt stops being a build-time constant. Instead, each terminal  
receives a per-company recovery salt inside its activation payload and seals it locally,  
so the fallback code becomes company-specific and cannot be computed from a downloaded  
build. Terminals already activated keep working: the old salt stays accepted for a short  
compatibility window and is dropped on their next successful sync, which re-seals the new  
one. Nothing about the ±3-minute drift, the 6-digit format or the lockout changes.