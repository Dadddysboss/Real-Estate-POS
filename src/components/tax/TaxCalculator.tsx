import React, { useState } from 'react';
import { Calculator, FileText, X } from 'lucide-react';
import { calculateTaxes, logTaxCalculation } from '../../services/tax.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface TaxCalculatorProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const SIZE_UNITS = ['Marla', 'Kanal', 'Murabba', 'Acre'] as const;

const MARLA_TO_SQFT: Record<string, number> = {
  Marla: 272.25,
  Kanal: 5445,
  Murabba: 27225,
  Acre: 43560,
};

export const TaxCalculator: React.FC<TaxCalculatorProps> = ({ currentUser }) => {
  const [buyerType, setBuyerType] = useState<'FILIER' | 'NON_FILER'>('FILIER');
  const [city, setCity] = useState('LAHORE');
  const [plotPrice, setPlotPrice] = useState(0);
  const [sizeValue, setSizeValue] = useState(5);
  const [sizeUnit, setSizeUnit] = useState<string>('Marla');
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const areaSqft = (sizeValue || 0) * (MARLA_TO_SQFT[sizeUnit] || 272.25);

  const handleCalculate = async () => {
    if (!plotPrice || areaSqft <= 0) {
      setMessage({ type: 'error', text: 'Enter valid plot price and area' });
      return;
    }
    try {
      const calcResult = calculateTaxes({ buyer_type: buyerType, city, plot_price: plotPrice, area_sqft: areaSqft });
      setResult(calcResult);
      await logTaxCalculation({ buyer_type: buyerType, city, plot_price: plotPrice, area_sqft: areaSqft }, calcResult, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: 'Calculation complete' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Calculation failed' });
    }
  };

  const clearForm = () => {
    setPlotPrice(0); setSizeValue(5); setSizeUnit('Marla'); setResult(null); setMessage(null);
  };

  return (
    <div className="page-container">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Calculator size={24} className="text-amber-400" /> Automated Tax & Duty Calculator
        </h2>
        <p className="text-sm text-slate-400">Module 20 — Stamp duty, VAT, advance income tax calculation</p>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Input Form */}
      <div className="glass-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Buyer Type</label>
            <select value={buyerType} onChange={(e) => setBuyerType(e.target.value as typeof buyerType)} className="input-base">
              <option value="FILIER">Filer</option>
              <option value="NON_FILER">Non-Filer</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="input-base">
              <option value="LAHORE">Lahore</option>
              <option value="ISLAMABAD">Islamabad</option>
              <option value="FAISALABAD">Faisalabad</option>
              <option value="RAWALPINDI">Rawalpindi</option>
              <option value="MULTAN">Multan</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Plot Price *</label>
            <input type="number" min={0} value={plotPrice || ''} onChange={(e) => setPlotPrice(Number(e.target.value) || 0)} className="input-base font-mono" placeholder="1000000" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Size Value</label>
            <input type="number" min={0} step={0.25} value={sizeValue || ''} onChange={(e) => setSizeValue(Number(e.target.value) || 0)} className="input-base" placeholder="e.g. 5" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Unit</label>
            <select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} className="input-base">
              {SIZE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handleCalculate}
            className="px-6 py-2 btn-primary text-sm flex items-center gap-2">
            <Calculator size={14} /> Calculate Taxes
          </button>
          <button onClick={clearForm} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs">Clear</button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <FileText size={16} className="text-amber-400" /> Tax Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-[10px] uppercase text-slate-500">Stamp Duty</p>
              <p className="text-lg font-bold text-amber-400 mt-1 font-mono">{fmt(result.stampDuty)}</p>
              <p className="text-[10px] text-slate-500">{((result.stampDuty / result.plot_price) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
              <p className="text-[10px] uppercase text-slate-500">Registration</p>
              <p className="text-lg font-bold text-sky-400 mt-1 font-mono">{fmt(result.registrationFee)}</p>
              <p className="text-[10px] text-slate-500">Flat Fee</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
              <p className="text-[10px] uppercase text-slate-500">VAT</p>
              <p className="text-lg font-bold text-purple-400 mt-1 font-mono">{fmt(result.vat)}</p>
              <p className="text-[10px] text-slate-500">{city !== 'LAHORE' ? ((result.vat / result.plot_price) * 100).toFixed(0) + '%' : '—'}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-[10px] uppercase text-slate-500">Adv. Income Tax</p>
              <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{fmt(result.advanceIncomeTax)}</p>
              <p className="text-[10px] text-slate-500">{buyerType}</p>
            </div>
            <div className="bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-rose-500/30 rounded-xl p-3">
              <p className="text-[10px] uppercase text-slate-500">TOTAL TAXES</p>
              <p className="text-lg font-bold text-rose-400 mt-1 font-mono">{fmt(result.totalTaxes)}</p>
              <p className="text-[10px] text-slate-500">{((result.totalTaxes / result.plot_price) * 100).toFixed(1)}% of price</p>
            </div>
          </div>

          {/* Details Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-2 px-3">Tax Component</th>
                  <th className="py-2 px-3">Amount (PKR)</th>
                  <th className="py-2 px-3">Rate Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="py-2 px-3 text-slate-300">Stamp Duty</td>
                  <td className="py-2 px-3 font-mono text-white">{fmt(result.stampDuty)}</td>
                  <td className="py-2 px-3 text-slate-500">{(((result.stampDuty / (result.plot_price / 100000)) * 100)).toFixed(2)} per lakh</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-slate-300">Registration Fee</td>
                  <td className="py-2 px-3 font-mono text-sky-400">{fmt(result.registrationFee)}</td>
                  <td className="py-2 px-3 text-slate-500">Flat</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-slate-300">VAT</td>
                  <td className="py-2 px-3 font-mono text-purple-400">{fmt(result.vat)}</td>
                  <td className="py-2 px-3 text-slate-500">{city !== 'LAHORE' ? ((result.vat / result.plot_price) * 100).toFixed(0) + '%' : 'Not applicable'}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-slate-300">Advance Income Tax</td>
                  <td className="py-2 px-3 font-mono text-emerald-400">{fmt(result.advanceIncomeTax)}</td>
                  <td className="py-2 px-3 text-slate-500">{buyerType} bracket</td>
                </tr>
                <tr className="bg-rose-500/5 font-semibold">
                  <td className="py-2 px-3 text-white">TOTAL</td>
                  <td className="py-2 px-3 font-mono text-rose-400">{fmt(result.totalTaxes)}</td>
                  <td className="py-2 px-3 text-slate-500">{((result.totalTaxes / result.plot_price) * 100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Plot Info */}
          <div className="mt-4 p-3 bg-slate-950/60 rounded-lg grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Plot Value</p>
              <p className="font-mono text-white text-lg">{fmt(plotPrice)}</p>
            </div>
            <div>
              <p className="text-slate-500">Price per sq ft</p>
              <p className="font-mono text-sky-400 text-lg">{fmt(Math.round(plotPrice / areaSqft))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxCalculator;