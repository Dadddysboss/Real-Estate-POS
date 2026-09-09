export interface ReceiptItem {
  name: string;
  price: number;
}

export interface ReceiptOptions {
  currency?: string;
  title?: string;
  receiptNumber?: string;
  date?: string;
  buyer?: string;
  reference?: string;
}

export const generateReceipt = (items: ReceiptItem[], options: ReceiptOptions = {}): string => {
  const currency = options.currency ?? '$';
  const title = options.title ?? 'RECEIPT';
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const lines: string[] = [
    title,
    options.receiptNumber ? `Receipt: ${options.receiptNumber}` : '',
    options.date ? `Date: ${options.date}` : '',
    options.buyer ? `Buyer: ${options.buyer}` : '',
    options.reference ? `Reference: ${options.reference}` : '',
    '',
    ...items.map((item) => `${item.name}: ${formatAmount(item.price, currency)}`),
    '',
    `Total: ${formatAmount(total, currency)}`,
  ];

  return lines.filter((line) => line !== '').join('\n');
};

export const validateReceipt = (
  receipt: string,
  items: ReceiptItem[],
  options: ReceiptOptions = {}
): boolean => {
  return receipt === generateReceipt(items, options);
};

const formatAmount = (amount: number, currency: string): string => {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(Math.round(amount)).toLocaleString('en-PK')}`;
};
