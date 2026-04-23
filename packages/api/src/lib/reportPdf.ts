// PDF generator for the report. Uses React.createElement instead of JSX so
// the API tsconfig doesn't need to enable JSX just for this one file.

import { createElement } from 'react';
import type { ReactElement } from 'react';
import {
  Document as RpdfDocument,
  Page as RpdfPage,
  View as RpdfView,
  Text as RpdfText,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

// @react-pdf/renderer ships React.Component classes whose generic parameters
// don't always unify with the @types/react resolved in this package when other
// workspaces pull in a newer React types copy. Casting to `any` at the element
// factory shields reportPdf.ts from that cross-workspace drift — the runtime
// behavior is identical.
const h = createElement as unknown as (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => ReactElement;
const Document = RpdfDocument as unknown as React.ElementType;
const Page = RpdfPage as unknown as React.ElementType;
const View = RpdfView as unknown as React.ElementType;
const Text = RpdfText as unknown as React.ElementType;

interface ProjectRow {
  name: string;
  folderName: string;
  estimatedMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  costCents: number;
}
interface SummaryRow {
  label: string;
  minutes: number;
  billableMinutes: number;
  costCents: number;
  isUnassigned?: boolean | undefined;
}

export interface ReportPdfInput {
  from: string;
  to: string;
  byInstructor: SummaryRow[];
  byProject: SummaryRow[];
  projects?: ProjectRow[];
  totals: { minutes: number; billableMinutes: number; costCents: number };
  unassigned?: { minutes: number; costCents: number };
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 10, color: '#64748b', marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    marginTop: 14,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e2e8f0',
    paddingVertical: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1 solid #94a3b8',
    paddingVertical: 4,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  cell: { flex: 2 },
  cellRight: { flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    fontFamily: 'Helvetica-Bold',
  },
  footer: { marginTop: 18, fontSize: 8, color: '#94a3b8' },
});

function fmtMinutes(m: number): string {
  const h2 = Math.floor(m / 60);
  const mm = m % 60;
  return `${h2}h ${mm}m`;
}
function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function summaryTable(title: string, rows: SummaryRow[], showUnassigned: boolean): ReactElement {
  const normal = rows.filter((r) => !r.isUnassigned);
  const unassigned = rows.find((r) => r.isUnassigned);
  return h(View, null, [
    h(Text, { key: 'title', style: styles.sectionTitle }, title),
    h(View, { key: 'hdr', style: styles.tableHeader }, [
      h(Text, { key: 'c1', style: styles.cell }, 'Name'),
      h(Text, { key: 'c2', style: styles.cellRight }, 'Hours'),
      h(Text, { key: 'c3', style: styles.cellRight }, 'Billable'),
      h(Text, { key: 'c4', style: styles.cellRight }, 'Cost'),
    ]),
    ...normal.map((r, i) =>
      h(View, { key: `r${i}`, style: styles.tableRow }, [
        h(Text, { key: 'c1', style: styles.cell }, r.label),
        h(Text, { key: 'c2', style: styles.cellRight }, fmtMinutes(r.minutes)),
        h(Text, { key: 'c3', style: styles.cellRight }, fmtMinutes(r.billableMinutes)),
        h(Text, { key: 'c4', style: styles.cellRight }, fmtCents(r.costCents)),
      ]),
    ),
    ...(showUnassigned && unassigned
      ? [
          h(View, { key: 'u', style: styles.tableRow }, [
            h(Text, { key: 'c1', style: styles.cell }, 'Unassigned'),
            h(Text, { key: 'c2', style: styles.cellRight }, fmtMinutes(unassigned.minutes)),
            h(
              Text,
              { key: 'c3', style: styles.cellRight },
              fmtMinutes(unassigned.billableMinutes),
            ),
            h(Text, { key: 'c4', style: styles.cellRight }, fmtCents(unassigned.costCents)),
          ]),
        ]
      : []),
  ]);
}

function projectsTable(rows: ProjectRow[]): ReactElement {
  return h(View, null, [
    h(Text, { key: 'title', style: styles.sectionTitle }, 'Projects — estimated vs. actual'),
    h(View, { key: 'hdr', style: styles.tableHeader }, [
      h(Text, { key: 'c1', style: styles.cell }, 'Project'),
      h(Text, { key: 'c2', style: styles.cell }, 'Folder'),
      h(Text, { key: 'c3', style: styles.cellRight }, 'Est'),
      h(Text, { key: 'c4', style: styles.cellRight }, 'Actual'),
      h(Text, { key: 'c5', style: styles.cellRight }, 'Variance'),
      h(Text, { key: 'c6', style: styles.cellRight }, 'Cost'),
    ]),
    ...rows.map((r, i) =>
      h(View, { key: `p${i}`, style: styles.tableRow }, [
        h(Text, { key: 'c1', style: styles.cell }, r.name),
        h(Text, { key: 'c2', style: styles.cell }, r.folderName),
        h(Text, { key: 'c3', style: styles.cellRight }, fmtMinutes(r.estimatedMinutes)),
        h(Text, { key: 'c4', style: styles.cellRight }, fmtMinutes(r.actualMinutes)),
        h(
          Text,
          { key: 'c5', style: styles.cellRight },
          `${r.varianceMinutes >= 0 ? '+' : '-'}${fmtMinutes(Math.abs(r.varianceMinutes))}`,
        ),
        h(Text, { key: 'c6', style: styles.cellRight }, fmtCents(r.costCents)),
      ]),
    ),
  ]);
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const doc = h(
    Document,
    null,
    h(Page, { size: 'LETTER', style: styles.page }, [
      h(Text, { key: 't', style: styles.title }, 'Outbreak — Report'),
      h(
        Text,
        { key: 's', style: styles.subtitle },
        `${input.from.slice(0, 10)} → ${input.to.slice(0, 10)}  ·  Currency: USD  ·  Rates from entry snapshots`,
      ),
      summaryTable('Totals by instructor', input.byInstructor, false),
      summaryTable('Totals by project', input.byProject, true),
      ...(input.projects && input.projects.length > 0
        ? [projectsTable(input.projects)]
        : []),
      h(View, { key: 'tot', style: { marginTop: 14 } }, [
        h(View, { key: 'tr', style: styles.totalRow }, [
          h(Text, { key: 'c1', style: styles.cell }, 'Grand total'),
          h(Text, { key: 'c2', style: styles.cellRight }, fmtMinutes(input.totals.minutes)),
          h(
            Text,
            { key: 'c3', style: styles.cellRight },
            fmtMinutes(input.totals.billableMinutes),
          ),
          h(Text, { key: 'c4', style: styles.cellRight }, fmtCents(input.totals.costCents)),
        ]),
      ]),
      input.unassigned
        ? h(
            Text,
            { key: 'un', style: styles.footer },
            `Unassigned time: ${fmtMinutes(input.unassigned.minutes)} · ${fmtCents(
              input.unassigned.costCents,
            )}`,
          )
        : null,
    ]),
  );
  return renderToBuffer(doc);
}
