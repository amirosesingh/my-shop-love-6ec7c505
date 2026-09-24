import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

describe("responsive tables", () => {
  it("copies desktop headers to mobile-card cell labels", () => {
    const html = renderToStaticMarkup(
      createElement(
        Table,
        { "aria-label": "Products" },
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, "Product"),
            createElement(TableHead, null, "Quantity"),
            createElement(TableHead),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, "Shuttle"),
            createElement(TableCell, null, "12"),
            createElement(TableCell, null, "Open"),
          ),
        ),
      ),
    );
    expect(html).toContain('data-mobile-cards="true"');
    expect(html).toContain('data-label="Product"');
    expect(html).toContain('data-label="Quantity"');
    expect(html).toContain('data-label=""');
  });

  it("allows specialised tables to opt out of card mode", () => {
    const html = renderToStaticMarkup(
      createElement(Table, { mobileCards: false }, createElement(TableBody)),
    );
    expect(html).toContain('data-mobile-cards="false"');
  });

  it("uses container-aware layout and fluid typography tokens", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@container (max-width: 900px)");
    expect(css).toContain("--text-sm: clamp(");
    expect(css).toContain("0.4cqi");
  });
});
