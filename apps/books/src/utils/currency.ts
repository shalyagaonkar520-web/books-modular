/**
 * Formats a numeric value into Indian Rupee currency format (₹).
 * Example: 150000 -> ₹1,50,000.00
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₹0.00';
  }

  // Format with standard INR format (en-IN)
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(amount);
}

/**
 * Converts a number to Indian currency words representation.
 * Example: 185000 -> One Lakh Eighty Five Thousand Rupees Only
 */
export function numberToIndianWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function twoDigits(num: number): string {
    if (num < 20) return ones[num];
    return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
  }

  function threeDigits(num: number): string {
    const h = Math.floor(num / 100);
    const rem = num % 100;
    let res = '';
    if (h > 0) {
      res += ones[h] + ' Hundred';
      if (rem > 0) res += ' and ';
    }
    if (rem > 0) {
      res += twoDigits(rem);
    }
    return res;
  }

  let remaining = n;
  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(twoDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(twoDigits(thousand) + ' Thousand');
  if (remaining > 0) parts.push(threeDigits(remaining));

  return parts.join(' ').trim() + ' Rupees Only';
}

