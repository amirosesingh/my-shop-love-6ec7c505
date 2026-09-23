#!/usr/bin/env node
/**
 * Static logic scan of src/.
 *
 * Produces src/lib/logic-health.report.json, which the in-app
 * "Logic health" dashboard renders. Nothing here runs in the browser.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
      if (entry.name === "__tests__" || SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) && !SKIP_FILES.includes(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Parse actual function boundaries; expression-bodied helpers cannot absorb the next test. */
function blocks(text) {
  const source = ts.createSourceFile("scan.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body && ts.isBlock(node.body)) {
      const name = node.name?.getText(source) || (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : "");
      if (name) {
        let awaited = false, handled = false, throws = false;
        const inspect = (child) => {
          if (child !== node.body && ts.isFunctionLike(child)) return;
          if (ts.isAwaitExpression(child)) awaited = true;
          if (ts.isTryStatement(child) && child.catchClause) handled = true;
          if (ts.isThrowStatement(child)) throws = true;
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === "catch") handled = true;
          ts.forEachChild(child, inspect);
        };
        inspect(node.body);
        const calls = [];
        const findCalls = (child) => {
          if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === name) calls.push(child);
          ts.forEachChild(child, findCalls);
        };
        findCalls(source);
        const protectedCall = (call) => {
          for (let parent = call.parent; parent; parent = parent.parent) {
            if (ts.isTryStatement(parent) && parent.catchClause && call.pos >= parent.tryBlock.pos && call.end <= parent.tryBlock.end) return true;
            if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "catch") return true;
            if (ts.isFunctionLike(parent)) break;
          }
          return false;
        };
        found.push({ name, start: node.getStart(source), body: node.body.getText(source), awaited,
          handled: handled || (calls.length > 0 && calls.every(protectedCall)), throws });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
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
    const isComment = t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
    if (
      /\b(not implemented|unimplemented|coming soon|stub(bed)? out|mock(ed)? (data|response|endpoint))\b/i.test(t) &&
      !/placeholder=/.test(t) &&
      !isComment &&
      !/\.test\s*\(/.test(t)
    ) {
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
    if (!b.awaited || b.handled || b.throws) continue;
    const line = lineOf(text, b.start);
    add(
      "info",
      "Review failure propagation",
      line,
      `${b.name}() propagates awaited failures to its caller.`,
      "Check that callers handle rejection. A missing local catch alone is not evidence of data loss.",
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

if (require.main === module) run();
module.exports = { blocks, scanFile, walk };
