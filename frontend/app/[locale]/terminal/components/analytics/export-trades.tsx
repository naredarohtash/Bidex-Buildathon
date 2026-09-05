"use client";

/**
 * Trade-history export.
 *
 * This was a card with its own heading, its own summary figures and its own two
 * buttons, sitting on a page that already had a heading and already showed those
 * figures. The dashboard's header carries the control now, so what is left here
 * is the part that was ever load-bearing: turning a list of settled trades into
 * a file, in the two formats a spreadsheet will open.
 */

import type { CompletedOrder } from "@/store/trade/use-binary-store";

export type ExportFormat = "csv" | "excel";

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function generateCSV(trades: CompletedOrder[]): string {
  const headers = [
    "ID",
    "Date",
    "Time",
    "Symbol",
    "Side",
    "Entry Price",
    "Exit Price",
    "Amount",
    "Profit/Loss",
    "Status",
    "Duration (s)",
  ];

  const rows = trades.map((trade) => {
    const duration = Math.round(
      (trade.expiryTime.getTime() - trade.entryTime.getTime()) / 1000
    );
    const pnl = trade.status === "WIN" ? trade.profit || 0 : -Math.abs(trade.profit || trade.amount);

    return [
      trade.id,
      formatDate(trade.expiryTime),
      formatTime(trade.expiryTime),
      trade.symbol,
      trade.side,
      trade.entryPrice.toFixed(4),
      trade.closePrice.toFixed(4),
      trade.amount.toFixed(2),
      pnl.toFixed(2),
      trade.status,
      duration.toString(),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function generateExcelXML(trades: CompletedOrder[], currency: string): string {
  // Generate Excel-compatible XML
  const escapeXML = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = trades.map((trade) => {
    const duration = Math.round(
      (trade.expiryTime.getTime() - trade.entryTime.getTime()) / 1000
    );
    const pnl = trade.status === "WIN" ? trade.profit || 0 : -Math.abs(trade.profit || trade.amount);

    return `
      <Row>
        <Cell><Data ss:Type="String">${escapeXML(trade.id)}</Data></Cell>
        <Cell><Data ss:Type="String">${formatDate(trade.expiryTime)}</Data></Cell>
        <Cell><Data ss:Type="String">${formatTime(trade.expiryTime)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXML(trade.symbol)}</Data></Cell>
        <Cell><Data ss:Type="String">${trade.side}</Data></Cell>
        <Cell><Data ss:Type="Number">${trade.entryPrice}</Data></Cell>
        <Cell><Data ss:Type="Number">${trade.closePrice}</Data></Cell>
        <Cell><Data ss:Type="Number">${trade.amount}</Data></Cell>
        <Cell><Data ss:Type="Number">${pnl}</Data></Cell>
        <Cell><Data ss:Type="String">${trade.status}</Data></Cell>
        <Cell><Data ss:Type="Number">${duration}</Data></Cell>
      </Row>`;
  });

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#CCCCCC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Win">
      <Font ss:Color="#22C55E"/>
    </Style>
    <Style ss:ID="Loss">
      <Font ss:Color="#EF4444"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Trade History">
    <Table>
      <Column ss:Width="100"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="60"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="60"/>
      <Column ss:Width="80"/>
      <Row ss:StyleID="Header">
        <Cell><Data ss:Type="String">ID</Data></Cell>
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Time</Data></Cell>
        <Cell><Data ss:Type="String">Symbol</Data></Cell>
        <Cell><Data ss:Type="String">Side</Data></Cell>
        <Cell><Data ss:Type="String">Entry Price</Data></Cell>
        <Cell><Data ss:Type="String">Exit Price</Data></Cell>
        <Cell><Data ss:Type="String">Amount (${currency})</Data></Cell>
        <Cell><Data ss:Type="String">P/L (${currency})</Data></Cell>
        <Cell><Data ss:Type="String">Status</Data></Cell>
        <Cell><Data ss:Type="String">Duration (s)</Data></Cell>
      </Row>
      ${rows.join("")}
    </Table>
  </Worksheet>
</Workbook>`;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


/**
 * Save the given trades as a file.
 *
 * The caller passes the trades already on screen — the same window, the same
 * filters — so what lands in the spreadsheet is what the dashboard was showing
 * when the button was pressed, rather than the whole account.
 */
export function downloadTrades(
  trades: CompletedOrder[],
  format: ExportFormat,
  currency = "USDT"
): void {
  if (trades.length === 0) return;
  const stamp = new Date().toISOString().split("T")[0];
  if (format === "csv") {
    downloadFile(generateCSV(trades), `trade-history-${stamp}.csv`, "text/csv;charset=utf-8;");
  } else {
    downloadFile(
      generateExcelXML(trades, currency),
      `trade-history-${stamp}.xls`,
      "application/vnd.ms-excel"
    );
  }
}
