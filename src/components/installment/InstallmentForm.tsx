import React, { useState } from 'react';
import { createInstallmentPlan } from '../../services/installment.service';

const InstallmentForm: React.FC = () => {
  const [amount, setAmount] = useState<number>(0);
  const [months, setMonths] = useState<number>(0);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(Number(e.target.value));
  };

  const handleMonthsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMonths(Number(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      plot_id: '',
      buyer_name: '',
      buyer_phone: '',
      buyer_cnic: '',
      total_sale_price: amount,
      down_payment: 0,
      plan_duration_months: months,
      monthly_installment_amount: amount / months,
      start_date: '',
      due_day_of_month: 1,
      grace_period_days: 0,
      late_penalty_fee: 0,
    };
    createInstallmentPlan('', '', payload).then(newPlan => console.log('New Plan:', newPlan));
  };

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
      <label htmlFor='amount'>Amount</label>
      <input
        type='number'
        id='amount'
        value={amount}
        onChange={handleAmountChange}
        className='border p-2'
      />
      <label htmlFor='months'>Months</label>
      <select
        id='months'
        value={months}
        onChange={handleMonthsChange}
        className='border p-2'
      >
        <option value={3}>3 Months</option>
        <option value={6}>6 Months</option>
        <option value={12}>12 Months</option>
      </select>
      <button type='submit' className='bg-blue-500 text-white p-2 rounded'>Calculate</button>
    </form>
  );
};

export default InstallmentForm;