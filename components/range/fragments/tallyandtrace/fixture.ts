/**
 * The ledger's made-up bills, as the Range boards draw them
 * (range-light-desktop at 1440, range-phone at 390). Nothing here is a real
 * bill, account or balance. Amounts are whole centavos, so the total is exact.
 */
export interface Bill {
  name: string;
  /** The bill's name at 390, where the board shortens it. */
  phoneName: string;
  /** The account the bill is paid from. */
  from: string;
  /** Days from the start of the month; the Due column sorts on it. */
  due: number;
  /** The due date. */
  dueDate: string;
  overdue: boolean;
  /** Centavos. */
  centavos: number;
}

export const BILLS: readonly Bill[] = [
  {
    name: "Water",
    phoneName: "Water",
    from: "GCash",
    due: 28,
    dueDate: "28 Nov",
    overdue: true,
    centavos: 65000,
  },
  {
    name: "Electricity",
    phoneName: "Electricity",
    from: "BPI Savings",
    due: 35,
    dueDate: "5 Dec",
    overdue: false,
    centavos: 320000,
  },
  {
    name: "Fibre internet",
    phoneName: "Fibre internet",
    from: "BPI Savings",
    due: 38,
    dueDate: "8 Dec",
    overdue: false,
    centavos: 170000,
  },
  {
    name: "Metrobank card statement",
    phoneName: "Card statement",
    from: "BPI Savings",
    due: 42,
    dueDate: "12 Dec",
    overdue: false,
    centavos: 1860000,
  },
  {
    name: "Condo dues",
    phoneName: "Condo dues",
    from: "BPI Savings",
    due: 45,
    dueDate: "15 Dec",
    overdue: false,
    centavos: 450000,
  },
  {
    name: "Laptop, instalment 7 of 12",
    phoneName: "Laptop, 7 of 12",
    from: "Metrobank card",
    due: 50,
    dueDate: "20 Dec",
    overdue: false,
    centavos: 416667,
  },
];

export const LEDGER_TITLE = "Bills due, December";
export const AVAILABLE = "₱47,650.00";
export const TABLE_LABEL = "Bills due in December, made-up figures";
export const TOTAL_LABEL = "Due this month";

/** 1234567 centavos as "12,345.67". */
export function money(centavos: number): string {
  const whole = Math.floor(centavos / 100);
  const cents = String(centavos % 100).padStart(2, "0");
  return `${whole.toLocaleString("en-US")}.${cents}`;
}

export const TOTAL = `₱${money(BILLS.reduce((sum, b) => sum + b.centavos, 0))}`;

export const CAPTION =
  "A working fragment with made-up figures. Sort by bill, due date or amount. Red means overdue, and nothing else.";
export const PHONE_CAPTION =
  "Made-up figures. Tap a column to sort. Red means overdue, and nothing else.";
