const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

/** Angka bulat ke kata bahasa Inggris, misalnya 1250 menjadi "one thousand two hundred fifty". */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "zero";
  const groups: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(`${underThousand(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return groups.join(" ");
}

/** Terbilang untuk cetakan invoice: "Forty-nine million ... Rupiah". Sen dibulatkan. */
export function amountInWords(value: number, currency = "IDR"): string {
  const unit = currency === "IDR" ? "Rupiah" : currency;
  const words = numberToWords(Math.round(value));
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${unit}`;
}
