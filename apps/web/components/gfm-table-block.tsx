"use client";

import type { ReactNode } from "react";

type Props = {
  header: string[];
  body: string[][];
  /** Render cell string (inline markdown, math, etc.); must be pure display. */
  renderCell: (value: string, key: string) => ReactNode;
  /** For React key prefix */
  keyBase: string;
};

export function GfmTableBlock({ header, body, renderCell, keyBase }: Props) {
  if (header.length === 0) return null;
  return (
    <div className="my-2 w-full min-w-0 max-w-full overflow-x-auto">
      <table
        className="w-full min-w-[min(100%,18rem)] border-collapse border-spacing-0 rounded-md border border-border/50 bg-muted/10 text-left text-sm text-foreground/90 dark:bg-muted/15"
        role="table"
      >
        <thead>
          <tr>
            {header.map((h, j) => (
              <th
                key={`${keyBase}-h${j}`}
                scope="col"
                className="border-b border-border/50 bg-muted/50 px-2.5 py-1.5 font-medium first:pl-2 last:pr-2 dark:border-border/40 dark:bg-muted/30"
              >
                {renderCell(h, `${keyBase}-hcell${j}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {body.map((row, ri) => (
            <tr key={`${keyBase}-r${ri}`}>
              {row.map((cell, ci) => (
                <td
                  key={`${keyBase}-c${ri}-${ci}`}
                  className="min-w-0 max-w-prose border-b border-border/35 px-2.5 py-1.5 align-top [overflow-wrap:anywhere] first:pl-2 last:pr-2 dark:border-border/30"
                >
                  {renderCell(cell, `${keyBase}-d${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
