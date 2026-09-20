const SAFE_CODES = new Set([
  "EDRIVER_MISSING", "ECONNECTION", "EAUTH", "ETLS", "ETIMEOUT",
  "EDATABASE", "ESCHEMA", "EPERMISSION", "EDPAPI", "EBADARG",
]);

function classify(error) {
  const raw = `${error?.code ?? ""} ${error?.message ?? String(error ?? "")}`.toLowerCase();
  if (/driver.*not found|data source name.*not found|cannot find module|node-gyp-build/.test(raw)) return "EDRIVER_MISSING";
  if (/login failed|authentication|18456/.test(raw)) return "EAUTH";
  if (/certificate|ssl|tls|encrypt/.test(raw)) return "ETLS";
  if (/timeout|timed out|etimeout/.test(raw)) return "ETIMEOUT";
  if (/permission|denied|not authorized|229\b/.test(raw)) return "EPERMISSION";
  if (/database|4060\b/.test(raw)) return "EDATABASE";
  return "ECONNECTION";
}

function safeError(error, fallback = "The SQL Server request failed.") {
  const code = SAFE_CODES.has(error?.code) ? error.code : classify(error);
  const messages = {
    EDRIVER_MISSING: "Microsoft ODBC Driver 18 for SQL Server is not installed or could not be loaded.",
    EAUTH: "SQL Server rejected the supplied credentials.",
    ETLS: "SQL Server could not establish the requested encrypted connection.",
    ETIMEOUT: "SQL Server did not respond before the timeout.",
    EDATABASE: "The selected database is unavailable or cannot be opened.",
    ESCHEMA: "The selected database schema is not compatible with this application.",
    EPERMISSION: "The SQL Server login does not have the required permission.",
    EDPAPI: "Windows secure storage is unavailable, so the credentials were not saved.",
    EBADARG: "The connection details are invalid.",
    ECONNECTION: fallback,
  };
  const hints = {
    EDRIVER_MISSING: "Install Microsoft ODBC Driver 18, then restart the application.",
    EAUTH: "Check the authentication mode, username and password.",
    ETLS: "Check Encrypt and Trust server certificate against the server certificate setup.",
    ETIMEOUT: "Check the entered hostname, TCP port and firewall rule.",
    EDATABASE: "Choose an online database that this login can access.",
    EPERMISSION: "Grant the login access or use an approved database administrator login.",
  };
  return { ok: false, code, error: messages[code] ?? fallback, hint: hints[code] ?? null };
}

module.exports = { classify, safeError };
