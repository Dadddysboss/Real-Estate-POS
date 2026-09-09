import { logAudit } from './audit.service';

export interface TaxCalculationPayload {
  buyer_type: 'FILIER' | 'NON_FILER';
  plot_price: number;
  city: string;
  area_sqft: number;
}

export interface TaxResult {
  stampDuty: number;
  registrationFee: number;
  vat: number;
  advanceIncomeTax: number;
  totalTaxes: number;
}

// Tax rates by city (simplified)
const CITY_RATES: Record<string, { stampDuty: number; vat: number }> = {
  'LAHORE': { stampDuty: 0.15, vat: 0 }, // Stamp duty 15%, no VAT
  'ISLAMABAD': { stampDuty: 0.14, vat: 0 },
  'FAISALABAD': { stampDuty: 0.15, vat: 0.1 }, // 10% VAT
  'RAWALPINDI': { stampDuty: 0.14, vat: 0 },
  'MULTAN': { stampDuty: 0.15, vat: 0.05 }, // 5% VAT
};

// Income tax brackets for advance income tax (PKR per sq ft, simplified)
const TAX_BRACKETS: Record<'FILIER' | 'NON_FILER', number[]> = {
  'FILIER': [0.25, 0.50, 1.00, 2.00], // Tiered rate based on price per sqft
  'NON_FILER': [0.50, 1.00, 2.00, 4.00], // Higher rates for non-filers
};

export function calculateStampDuty(ratePercent: number): number {
  return Math.round((ratePercent / 100) * 1000); // Rs. per lakh
}

export function calculateAdvanceIncomeTax(pricePerSqFt: number, buyerType: 'FILIER' | 'NON_FILER'): number {
  const brackets = TAX_BRACKETS[buyerType];
  if (pricePerSqFt < brackets[0]) return 0;
  if (pricePerSqFt < brackets[1]) return Math.round(pricePerSqFt * 50);
  if (pricePerSqFt < brackets[2]) return Math.round(brackets[1] * 50 + (pricePerSqFt - brackets[1]) * 100);
  return Math.round(brackets[1] * 50 + brackets[2] * 100 + (pricePerSqFt - brackets[2]) * 200);
}

export function calculateTaxes(payload: TaxCalculationPayload): TaxResult {
  const cityRates = CITY_RATES[payload.city.toUpperCase()] || CITY_RATES['LAHORE'];
  
  const stampDutyRate = payload.buyer_type === 'NON_FILER' ? cityRates.stampDuty * 1.1 : cityRates.stampDuty; // 10% extra for non-filer
  const stampDuty = Math.round((stampDutyRate / 100) * payload.plot_price);
  const registrationFee = 5000; // Flat fee
  const vat = cityRates.vat > 0 ? Math.round((cityRates.vat / 100) * payload.plot_price) : 0;
  
  const pricePerSqFt = payload.area_sqft > 0 ? payload.plot_price / payload.area_sqft : 0;
  const advanceIncomeTax = calculateAdvanceIncomeTax(pricePerSqFt, payload.buyer_type);
  
  const totalTaxes = stampDuty + registrationFee + vat + advanceIncomeTax;
  
  return { stampDuty, registrationFee, vat, advanceIncomeTax, totalTaxes };
}

export async function logTaxCalculation(payload: TaxCalculationPayload, result: TaxResult, userId: string, userName: string): Promise<void> {
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'TAX_CALCULATOR',
    entityId: '',
    description: `Tax calculation: ${payload.buyer_type}, ${payload.area_sqft} sqft @ Rs.${Math.round(payload.plot_price).toLocaleString()} — Total taxes: Rs. ${result.totalTaxes.toLocaleString()}`,
  });
}
