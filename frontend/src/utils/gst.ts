/** GST state codes (as on a GSTIN) and common TDS / TCS rates; mirrors backend/services/gst.py. */

export const GST_STATES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '96', name: 'Other Country' },
  { code: '97', name: 'Other Territory' },
];

export const stateOptions = GST_STATES.map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }));

/** The state a GSTIN belongs to (its first two digits), or null. */
export function stateFromGstin(gstin?: string | null): string | null {
  const match = /^(\d{2})[A-Z0-9]{13}$/.exec((gstin ?? '').trim().toUpperCase());
  return match && GST_STATES.some((s) => s.code === match[1]) ? match[1] : null;
}

// A GSTIN carries its own check character: 27 ABCDE1234F 2 Z 5 is the state,
// the PAN, the registration number, Z, and a Luhn mod 36 check over the first 14.
// Checking it catches a mistyped or swapped character before a return is rejected.
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][A-Z][0-9A-Z]$/;

/** True when a GSTIN has the right shape and its last character checks out (mirrors backend gst.gstin_checksum_ok). */
export function gstinChecksumOk(value?: string | null): boolean {
  const gstin = (value ?? '').trim().toUpperCase();
  if (!GSTIN_FORMAT.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

/** The PAN inside a GSTIN (characters 3 to 12), or null when it is not a full GSTIN. */
export function panFromGstin(value?: string | null): string | null {
  const gstin = (value ?? '').trim().toUpperCase();
  return GSTIN_FORMAT.test(gstin) ? gstin.slice(2, 12) : null;
}

/** Income-tax TDS sections commonly deducted on vendor bills, with their usual rates. */
export const TDS_SECTIONS: Array<{ section: string; label: string; rate: number }> = [
  { section: '194C', label: '194C - Contractors (company / firm)', rate: 2 },
  { section: '194C-I', label: '194C - Contractors (individual / HUF)', rate: 1 },
  { section: '194J', label: '194J - Professional fees', rate: 10 },
  { section: '194J-T', label: '194J - Technical services', rate: 2 },
  { section: '194H', label: '194H - Commission or brokerage', rate: 2 },
  { section: '194I-A', label: '194I - Rent of plant and machinery', rate: 2 },
  { section: '194I-B', label: '194I - Rent of land, building or furniture', rate: 10 },
  { section: '194Q', label: '194Q - Purchase of goods', rate: 0.1 },
  { section: '194A', label: '194A - Interest (other than securities)', rate: 10 },
];

export const TCS_RATES = [0, 0.1, 1, 5];
