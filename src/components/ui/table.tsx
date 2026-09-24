import * as React from "react";

import { cn } from "@/lib/utils";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors duration-[var(--motion-fast)] hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

function plainText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return "";
  return React.Children.toArray(node.props.children).map(plainText).join(" ").trim();
}

function findHeaderLabels(node: React.ReactNode): string[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  if (node.type === TableHeader) {
    const labels: string[] = [];
    const visit = (child: React.ReactNode) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
      if (child.type === TableHead) labels.push(plainText(child.props.children));
      else React.Children.forEach(child.props.children, visit);
    };
    React.Children.forEach(node.props.children, visit);
    return labels;
  }
  for (const child of React.Children.toArray(node.props.children)) {
    const labels = findHeaderLabels(child);
    if (labels.length) return labels;
  }
  return [];
}

function labelBodyRows(node: React.ReactNode, labels: string[]): React.ReactNode {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (node.type === TableRow) {
    let column = 0;
    const children = React.Children.map(node.props.children, (cell) => {
      type ResponsiveCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
        "data-label"?: string;
      };
      if (!React.isValidElement<ResponsiveCellProps>(cell)) return cell;
      if (cell.type !== TableCell) return cell;
      const label = cell.props["data-label"] ?? labels[column] ?? "";
      column += Number(cell.props.colSpan ?? 1);
      return React.cloneElement(cell, { "data-label": label });
    });
    return React.cloneElement(node, undefined, children);
  }
  const children = React.Children.map(node.props.children, (child) => labelBodyRows(child, labels));
  return React.cloneElement(node, undefined, children);
}

function labelTableBodies(node: React.ReactNode, labels: string[]): React.ReactNode {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (node.type === TableBody)
    return React.cloneElement(
      node,
      undefined,
      React.Children.map(node.props.children, (row) => labelBodyRows(row, labels)),
    );
  return React.cloneElement(
    node,
    undefined,
    React.Children.map(node.props.children, (child) => labelTableBodies(child, labels)),
  );
}

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /** Collapse each row into a labelled card below tablet width. */
  mobileCards?: boolean;
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, mobileCards = true, ...props }, ref) => {
    let labels: string[] = [];
    for (const child of React.Children.toArray(children)) {
      labels = findHeaderLabels(child);
      if (labels.length) break;
    }
    const content = React.Children.map(children, (child) => labelTableBodies(child, labels));
    return (
      <div className="responsive-table-region relative w-full max-w-full overflow-x-auto overscroll-x-contain">
        <table
          ref={ref}
          data-mobile-cards={mobileCards ? "true" : "false"}
          className={cn("responsive-table w-full caption-bottom text-sm", className)}
          {...props}
        >
          {content}
        </table>
      </div>
    );
  },
);
Table.displayName = "Table";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
