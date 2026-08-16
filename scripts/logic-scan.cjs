#!/usr/bin/env node
/**
 * Static logic scan of src/.
 *
 * Produces src/lib/logic-health.report.json, which the in-app
 * "Logic health" dashboard renders. Nothing here runs in the browser.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "lib", "logic-health.report.json");

const SKIP_FILES = [
  "logic-health.report.json",
  "routeTree.gen.ts",
  "types.ts",
];
const SKIP_DIRS = ["components/ui", "__tests__", "integrations/supabase"];

/** Files where a swallowed failure costs money, stock or access. */
const MONEY = /(checkout|payment|tender|discount|refund|void|drawer|shift-close|shift_close|stock|inventory|sale|bill-number|coupon|voucher|purchas)/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP_FILES.includes(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Rough function-block extraction: good enough to ask "is there a try in here?" */
function blocks(text) {
  const found = [];
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1] || m[2];
    const open = text.indexOf("{", m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    let end = open;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    found.push({ name, start: m.index, body: text.slice(open, end + 1) });
  }
  return found;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function scanFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const money = MONEY.test(rel);
  const findings = [];
  const add = (severity, rule, line, detail, hint) =>
    findings.push({ id: `${rel}:${line}:${rule}`, file: rel, line, rule, severity, detail, hint });

  lines.forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();

    // 1. Placeholders and unfinished work
    const todo = t.match(/(?:\/\/|\/\*|\*)\s*(TODO|FIXME|XXX|HACK)\b[:\s-]*(.*)/);
    if (todo) {
      add(
        money ? "warning" : "info",
        "Unfinished work",
        line,
        `${todo[1]}: ${(todo[2] || "").slice(0, 120) || "no detail given"}`,
        "Finish the note or delete it.",
      );
    }
    if (/not implemented|unimplemented|coming soon|placeholder/i.test(t) && !t.startsWith("*")) {
      add(money ? "critical" : "warning", "Placeholder logic", line, t.slice(0, 140),
        "This path tells the user nothing happens yet.");
    }
    if (/throw new Error\(\s*["'`](TODO|not implemented)/i.test(t)) {
      add("critical", "Placeholder logic", line, t.slice(0, 140), "A call here throws instead of working.");
    }

    // 2. Dead UI connections
    const dead = t.match(/\b(onClick|onSubmit|onChange|onValueChange|onCheckedChange)=\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*\}/);
    if (dead) {
      add("warning", "Button does nothing", line, `${dead[1]} has an empty handler.`,
        "Wire it to a real action or hide the control.");
    }
    const logOnly = t.match(/\b(onClick|onSubmit)=\{\s*\(\s*\)\s*=>\s*console\.(log|warn)\(/);
    if (logOnly) {
      add("warning", "Button only logs", line, `${logOnly[1]} writes to the console instead of acting.`,
        "Replace the log with the real handler.");
    }
    if (/<form(\s|>)/.test(t) && !/onSubmit/.test(raw) && !/onSubmit/.test(lines.slice(i, i + 6).join(" "))) {
      add("warning", "Form has no submit handler", line, "A <form> is rendered without onSubmit.",
        "Pressing Enter in this form reloads the page.");
    }

    // 3. Input validation
    if (/Number\(\s*e\.target\.value\s*\)/.test(t) && !/\|\|\s*0|isNaN|Number\.isFinite|clamp/.test(raw)) {
      add(money ? "warning" : "info", "Unvalidated number input", line, t.slice(0, 140),
        "An empty or bad entry becomes NaN.");
    }
    if (/parseInt\((?![^)]*,\s*10)/.test(t)) {
      add("info", "parseInt without a radix", line, t.slice(0, 140), "Pass 10 as the radix.");
    }
  });

  // 4. Awaited work with no failure handling, inside money / stock paths
  for (const b of blocks(text)) {
    if (!/\bawait\b/.test(b.body)) continue;
    if (/\btry\s*\{/.test(b.body)) continue;
    if (/\.catch\(/.test(b.body)) continue;
    if (b.body.length > 8000) continue;
    const line = lineOf(text, b.start);
    add(
      money ? "critical" : "info",
      "No failure handling",
      line,
      `${b.name}() awaits work without a try/catch.`,
      money
        ? "A dropped connection here can lose money or stock movements."
        : "Consider reporting the failure to the user.",
    );
  }

  return findings;
}

function run() {
  const files = walk(SRC);
  const findings = files.flatMap(scanFile);
  const order = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  const report = {
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    counts: {
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    findings,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Logic scan: ${files.length} files, ${report.counts.critical} critical, ${report.counts.warning} warning, ${report.counts.info} info -> ${path.relative(ROOT, OUT)}`,
  );
}

run();
