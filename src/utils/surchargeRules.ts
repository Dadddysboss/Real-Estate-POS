export const calculateSurcharge = (amount: number, surchargeRate: number): number => {
  return (amount * surchargeRate) / 100;
};

export const validateSurcharge = (amount: number, surcharge: number, surchargeRate: number): boolean => {
  return surcharge === calculateSurcharge(amount, surchargeRate);
};