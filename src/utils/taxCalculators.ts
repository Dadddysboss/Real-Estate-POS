export const calculateTax = (amount: number, taxRate: number): number => {
  return (amount * taxRate) / 100;
};

export const validateTax = (amount: number, tax: number, taxRate: number): boolean => {
  return tax === calculateTax(amount, taxRate);
};