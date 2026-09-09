import React, { useState, useEffect } from 'react';
import { Building2, Plus, Trash2, Edit3, X, Users, Calendar } from 'lucide-react';
import { Plaza, PlazaUnit } from '../../types/electron';
import {
  fetchPlazas, createPlaza, deletePlaza,
  fetchUnits, createPlazaUnit, updatePlazaUnitStatus, deletePlazaUnit,
  unitsByFloor, plazaUnitStats,
  FLOOR_LEVELS, FloorLevel, PlazaUnitStatus
} from '../../services/plaza.service';

interface PlazaManagementProps {
  branchId: string;
  currentUser: { id: string; username: string; fullName: string };
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const STATUS_STYLE: Record<PlazaUnitStatus, string> = {
  AVAILABLE: 'status-emerald',
  RENTED: 'status-sky',
  SOLD: 'status-rose',
  ON_HOLD: 'status-amber',
};

export const PlazaManagement: React.FC<PlazaManagementProps> = ({ branchId, currentUser }) => {
  const [plazas, setPlazas] = useState<Plaza[]>([]);
  const [selectedPlaza, setSelectedPlaza] = useState<Plaza | null>(null);
  const [units, setUnits] = useState<PlazaUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPlaza, setShowAddPlaza] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<PlazaUnit | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Plaza form
  const [plazaName, setPlazaName] = useState('');
  const [plazaCity, setPlazaCity] = useState('');
  const [plazaFloors, setPlazaFloors] = useState(1);

  // Add Unit form
  const [unitFloor, setUnitFloor] = useState<FloorLevel>('GROUND');
  const [unitNumber, setUnitNumber] = useState('');
  const [unitArea, setUnitArea] = useState(0);
  const [unitRate, setUnitRate] = useState(0);
  const [unitTarget, setUnitTarget] = useState(0);
  const [unitRent, setUnitRent] = useState(0);
  const [unitMaintenance, setUnitMaintenance] = useState(0);
  const [unitStatus, setUnitStatus] = useState<PlazaUnitStatus>('AVAILABLE');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [leaseExpiry, setLeaseExpiry] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState(0);

  const loadPlazas = async () => {
    setLoading(true);
    try {
      const data = await fetchPlazas(branchId);
      setPlazas(data);
      if (data.length > 0 && !selectedPlaza) {
        setSelectedPlaza(data[0]);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load plazas' });
    }
    setLoading(false);
  };

  const loadUnits = async (plazaId: string) => {
    try {
      const data = await fetchUnits(plazaId);
      setUnits(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load units' });
    }
  };

  useEffect(() => {
    loadPlazas();
  }, [branchId]);

  useEffect(() => {
    if (selectedPlaza) {
      loadUnits(selectedPlaza.id);
    }
  }, [selectedPlaza]);

  const handleAddPlaza = async () => {
    if (!plazaName.trim() || !plazaCity.trim()) {
      setMessage({ type: 'error', text: 'Plaza name and city are required' });
      return;
    }
    try {
      await createPlaza(branchId, currentUser.id, currentUser.fullName, {
        plaza_name: plazaName.trim(),
        city_location: plazaCity.trim(),
        total_floors: plazaFloors,
      });
      setMessage({ type: 'success', text: 'Plaza added successfully' });
      setShowAddPlaza(false);
      setPlazaName('');
      setPlazaCity('');
      setPlazaFloors(1);
      await loadPlazas();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add plaza' });
    }
  };

  const handleDeletePlaza = async (plaza: Plaza) => {
    if (!window.confirm(`Delete ${plaza.plaza_name}? This will also delete all units.`)) return;
    try {
      await deletePlaza(plaza.id, currentUser.id, currentUser.fullName, plaza.plaza_name);
      setMessage({ type: 'success', text: 'Plaza deleted' });
      if (selectedPlaza?.id === plaza.id) {
        setSelectedPlaza(null);
        setUnits([]);
      }
      await loadPlazas();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete plaza' });
    }
  };

  const handleAddUnit = async () => {
    if (!selectedPlaza || !unitNumber.trim()) {
      setMessage({ type: 'error', text: 'Unit number is required' });
      return;
    }
    try {
      await createPlazaUnit(selectedPlaza.id, currentUser.id, currentUser.fullName, {
        floor_level: unitFloor,
        unit_number: unitNumber.trim(),
        covered_area_sqft: unitArea,
        rate_per_sqft: unitRate,
        target_price: unitTarget,
        target_monthly_rent: unitRent,
        maintenance_fee: unitMaintenance,
        status: unitStatus,
        tenant_name: tenantName.trim(),
        tenant_phone: tenantPhone.trim(),
        lease_expiry_date: leaseExpiry,
        security_deposit: securityDeposit,
      });
      setMessage({ type: 'success', text: 'Unit added successfully' });
      setShowAddUnit(false);
      resetUnitForm();
      await loadUnits(selectedPlaza.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add unit' });
    }
  };

  const handleUpdateUnitStatus = async (unit: PlazaUnit, newStatus: PlazaUnitStatus) => {
    setEditingUnit(unit);
    setUnitStatus(newStatus);
    setUnitFloor(unit.floor_level as FloorLevel);
    setUnitNumber(unit.unit_number);
    setUnitArea(unit.covered_area_sqft);
    setUnitRate(unit.rate_per_sqft);
    setUnitTarget(unit.target_price);
    setUnitRent(unit.target_monthly_rent);
    setUnitMaintenance(unit.maintenance_fee);
    setTenantName(unit.tenant_name || '');
    setTenantPhone(unit.tenant_phone || '');
    setLeaseExpiry(unit.lease_expiry_date || '');
    setSecurityDeposit(unit.security_deposit);
    setShowAddUnit(true);
  };

  const handleSaveUnitEdit = async () => {
    if (!editingUnit || !selectedPlaza) return;
    try {
      await updatePlazaUnitStatus(
        editingUnit,
        unitStatus,
        { tenant_name: tenantName.trim(), tenant_phone: tenantPhone.trim(), lease_expiry_date: leaseExpiry, security_deposit: securityDeposit },
        currentUser.id,
        currentUser.fullName
      );
      setMessage({ type: 'success', text: 'Unit updated' });
      setShowAddUnit(false);
      setEditingUnit(null);
      resetUnitForm();
      await loadUnits(selectedPlaza.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update unit' });
    }
  };

  const handleDeleteUnit = async (unit: PlazaUnit) => {
    if (!selectedPlaza) return;
    if (!window.confirm(`Delete unit ${unit.unit_number}?`)) return;
    try {
      await deletePlazaUnit(unit.id, currentUser.id, currentUser.fullName, `${unit.unit_number} (${unit.floor_level})`);
      setMessage({ type: 'success', text: 'Unit deleted' });
      await loadUnits(selectedPlaza.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete unit' });
    }
  };

  const resetUnitForm = () => {
    setUnitFloor('GROUND');
    setUnitNumber('');
    setUnitArea(0);
    setUnitRate(0);
    setUnitTarget(0);
    setUnitRent(0);
    setUnitMaintenance(0);
    setUnitStatus('AVAILABLE');
    setTenantName('');
    setTenantPhone('');
    setLeaseExpiry('');
    setSecurityDeposit(0);
  };

  const stats = plazaUnitStats(units);
  const floors = unitsByFloor(units);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 size={24} className="text-emerald-400" /> Commercial Plazas & Multi-Unit Hierarchy
          </h2>
          <p className="text-sm text-slate-400">Module 6 — Building → Floor → Unit Navigation</p>
        </div>
        <button onClick={() => setShowAddPlaza(true)} className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> Add Plaza
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading plazas...</div>
      ) : plazas.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-500 text-sm">
          No plazas registered. Click "Add Plaza" to create your first building.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Plaza List */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Buildings</h3>
            {plazas.map((plaza) => (
              <div
                key={plaza.id}
                onClick={() => setSelectedPlaza(plaza)}
                className={`glass-card p-4 cursor-pointer transition-all ${selectedPlaza?.id === plaza.id ? 'ring-2 ring-emerald-500/50' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-white">{plaza.plaza_name}</h4>
                    <p className="text-xs text-slate-400">{plaza.city_location}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePlaza(plaza); }}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-500">{plaza.total_floors} floors</div>
              </div>
            ))}
          </div>

          {/* Plaza Details */}
          <div className="lg:col-span-3 space-y-4">
            {selectedPlaza ? (
              <>
                {/* Plaza Header */}
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedPlaza.plaza_name}</h3>
                      <p className="text-sm text-slate-400">{selectedPlaza.city_location}</p>
                    </div>
                    <button onClick={() => setShowAddUnit(true)} className="flex items-center gap-2 px-4 py-2 btn-primary text-sm">
                      <Plus size={16} /> Add Unit
                    </button>
                  </div>
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950/60 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Units</p>
                      <p className="text-xl font-bold text-white mt-1">{stats.totalUnits}</p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Available</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">{stats.available}</p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Rented</p>
                      <p className="text-xl font-bold text-sky-400 mt-1">{stats.rented}</p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Monthly Rent</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">{fmt(stats.monthlyRentProjection)}</p>
                    </div>
                  </div>
                </div>

                {/* Floor Tabs */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                    {floors.map((f) => (
                      <button
                        key={f.floor}
                        onClick={() => document.getElementById(`floor-${f.floor}`)?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold whitespace-nowrap"
                      >
                        {f.floor.replaceAll('_', ' ')} ({f.units.length})
                      </button>
                    ))}
                  </div>

                  {/* Units by Floor */}
                  <div className="space-y-6">
                    {floors.map((f) => (
                      <div key={f.floor} id={`floor-${f.floor}`}>
                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                          {f.floor.replaceAll('_', ' ')}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {f.units.map((unit) => (
                            <div key={unit.id} className="glass-card p-4 space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h5 className="font-semibold text-white">Unit {unit.unit_number}</h5>
                                  <p className="text-xs text-slate-400">{unit.covered_area_sqft} sqft @ Rs. {unit.rate_per_sqft}/sqft</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_STYLE[unit.status]}`}>
                                  {unit.status}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-slate-500">Target Price</span>
                                  <p className="font-mono font-semibold text-emerald-400">{fmt(unit.target_price)}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Monthly Rent</span>
                                  <p className="font-mono font-semibold text-sky-400">{fmt(unit.target_monthly_rent)}</p>
                                </div>
                              </div>
                              {unit.status === 'RENTED' && unit.tenant_name && (
                                <div className="pt-2 border-t border-slate-800/60 space-y-1 text-xs">
                                  <div className="flex items-center gap-1 text-slate-400">
                                    <Users size={12} />
                                    <span>{unit.tenant_name}</span>
                                  </div>
                                  {unit.tenant_phone && (
                                    <div className="text-slate-500">{unit.tenant_phone}</div>
                                  )}
                                  {unit.lease_expiry_date && (
                                    <div className="flex items-center gap-1 text-slate-500">
                                      <Calendar size={12} />
                                      <span>Expires: {new Date(unit.lease_expiry_date).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  onClick={() => handleUpdateUnitStatus(unit, unit.status === 'AVAILABLE' ? 'RENTED' : 'AVAILABLE')}
                                  className="flex-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                                >
                                  <Edit3 size={12} className="inline mr-1" />
                                  {unit.status === 'AVAILABLE' ? 'Rent' : 'Edit'}
                                </button>
                                <button
                                  onClick={() => handleDeleteUnit(unit)}
                                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-lg text-xs"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card p-12 text-center text-slate-500 text-sm">
                Select a plaza from the left to view its units.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Plaza Modal */}
      {showAddPlaza && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowAddPlaza(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add New Plaza</h3>
              <button onClick={() => setShowAddPlaza(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Plaza Name *</label>
                <input type="text" value={plazaName} onChange={(e) => setPlazaName(e.target.value)} className="input-base" placeholder="e.g. Al-Hafeez Tower" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">City Location *</label>
                <input type="text" value={plazaCity} onChange={(e) => setPlazaCity(e.target.value)} className="input-base" placeholder="e.g. Lahore" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Floors</label>
                <input type="number" min={1} value={plazaFloors} onChange={(e) => setPlazaFloors(Number(e.target.value) || 1)} className="input-base" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowAddPlaza(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddPlaza} className="px-5 py-2 btn-primary text-xs">Add Plaza</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Unit Modal */}
      {showAddUnit && selectedPlaza && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => { setShowAddUnit(false); setEditingUnit(null); resetUnitForm(); }}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">{editingUnit ? `Edit Unit ${editingUnit.unit_number}` : 'Add New Unit'}</h3>
              <button onClick={() => { setShowAddUnit(false); setEditingUnit(null); resetUnitForm(); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Floor Level</label>
                <select value={unitFloor} onChange={(e) => setUnitFloor(e.target.value as FloorLevel)} className="input-base">
                  {FLOOR_LEVELS.map((f) => <option key={f} value={f}>{f.replaceAll('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Unit Number *</label>
                <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="input-base" placeholder="e.g. A-101" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Covered Area (sqft)</label>
                <input type="number" min={0} value={unitArea || ''} onChange={(e) => setUnitArea(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Rate per sqft (PKR)</label>
                <input type="number" min={0} value={unitRate || ''} onChange={(e) => setUnitRate(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Sale Price (PKR)</label>
                <input type="number" min={0} value={unitTarget || ''} onChange={(e) => setUnitTarget(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Monthly Rent (PKR)</label>
                <input type="number" min={0} value={unitRent || ''} onChange={(e) => setUnitRent(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Maintenance Fee (PKR)</label>
                <input type="number" min={0} value={unitMaintenance || ''} onChange={(e) => setUnitMaintenance(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value as PlazaUnitStatus)} className="input-base">
                  <option value="AVAILABLE">Available</option>
                  <option value="RENTED">Rented</option>
                  <option value="SOLD">Sold</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
              {unitStatus === 'RENTED' && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Tenant Name</label>
                    <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="input-base" placeholder="Tenant name" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Tenant Phone</label>
                    <input type="text" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="input-base" placeholder="0300-1234567" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Lease Expiry Date</label>
                    <input type="date" value={leaseExpiry} onChange={(e) => setLeaseExpiry(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Security Deposit (PKR)</label>
                    <input type="number" min={0} value={securityDeposit || ''} onChange={(e) => setSecurityDeposit(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => { setShowAddUnit(false); setEditingUnit(null); resetUnitForm(); }} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={editingUnit ? handleSaveUnitEdit : handleAddUnit} className="px-5 py-2 btn-primary text-xs">
                {editingUnit ? 'Update Unit' : 'Add Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlazaManagement;