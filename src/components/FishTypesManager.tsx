import React, { useState } from 'react';
import { FishType, FishUnit } from '../types';
import { Fish, Plus, Trash2, Edit2, Sparkles } from 'lucide-react';

interface FishTypesManagerProps {
  fishTypes: FishType[];
  currency: string;
  onAddFishType: (fish: Partial<FishType>) => void;
  onUpdateFishType: (fish: FishType) => void;
  onDeleteFishType: (id: string) => void;
}

export const FishTypesManager: React.FC<FishTypesManagerProps> = ({
  fishTypes,
  currency,
  onAddFishType,
  onUpdateFishType,
  onDeleteFishType,
}) => {
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [arabicName, setArabicName] = useState('');
  const [name, setName] = useState('');
  const [defaultUnit, setDefaultUnit] = useState<FishUnit>('kg');
  const [unitLabel, setUnitLabel] = useState('كيلو');

  const handleOpenAdd = () => {
    setEditingId(null);
    setArabicName('');
    setName('');
    setDefaultUnit('kg');
    setUnitLabel('كيلو');
    setIsOpenModal(true);
  };

  const handleOpenEdit = (fish: FishType) => {
    setEditingId(fish.id);
    setArabicName(fish.arabicName);
    setName(fish.name);
    setDefaultUnit(fish.defaultUnit);
    setUnitLabel(fish.unitLabel);
    setIsOpenModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!arabicName.trim()) return;

    if (editingId) {
      const existing = fishTypes.find((f) => f.id === editingId);
      if (existing) {
        onUpdateFishType({
          ...existing,
          arabicName: arabicName.trim(),
          name: name.trim() || arabicName.trim(),
          defaultUnit,
          unitLabel,
        });
      }
    } else {
      onAddFishType({
        arabicName: arabicName.trim(),
        name: name.trim() || arabicName.trim(),
        defaultUnit,
        unitLabel,
        popular: true,
      });
    }

    setIsOpenModal(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-300 rounded-none p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Fish className="w-5 h-5 text-blue-600" />
              دليل أنواع الأسماك والوحدات
            </h2>
            <p className="text-xs text-slate-500">
              قائمة أصناف الأسماك المتاحة في تسجيل فاتورة ووحدات القياس المعتمدة
            </p>
          </div>

          <button
            id="add-fish-type-btn"
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ إضافة نوع سمك جديد</span>
          </button>
        </div>

        {/* Fish Types Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {fishTypes.map((fish) => (
            <div
              key={fish.id}
              className="bg-slate-50/70 border border-slate-300 rounded-none p-3.5 space-y-2.5 hover:border-blue-300 hover:bg-white transition-all shadow-2xs"
            >
              <div className="flex items-start justify-between">
                <span className="font-black text-sm text-slate-900">{fish.arabicName}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(fish)}
                    className="p-1 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFishType(fish.id)}
                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-baseline text-xs text-slate-500">
                <span>الوحدة الافتراضية:</span>
                <span className="font-bold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 rounded">
                  {fish.unitLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Add/Edit Fish Type */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-300 rounded-none p-6 max-w-sm w-full space-y-4 shadow-xl animate-in fade-in zoom-in-95"
          >
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              {editingId ? 'تعديل نوع السمك' : 'إضافة نوع سمك جديد'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">اسم السمك (بالعربي) *</label>
                <input
                  type="text"
                  required
                  value={arabicName}
                  onChange={(e) => setArabicName(e.target.value)}
                  placeholder="مثال: ديرك، ثمد، باغة، شعور..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">وحدة القياس الافتراضية</label>
                <select
                  value={unitLabel}
                  onChange={(e) => {
                    setUnitLabel(e.target.value);
                    if (e.target.value === 'صندوق') setDefaultUnit('box');
                    else if (e.target.value === 'طراد / شلة') setDefaultUnit('lot');
                    else if (e.target.value === 'حبة') setDefaultUnit('piece');
                    else if (e.target.value === 'حوت') setDefaultUnit('whale');
                    else setDefaultUnit('kg');
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="كيلو">كيلو (كجم)</option>
                  <option value="صندوق">صندوق</option>
                  <option value="طراد / شلة">طراد / شلة</option>
                  <option value="حبة">حبة</option>
                  <option value="حوت">حوت</option>
                  <option value="سلة">سلة</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsOpenModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none shadow-xs transition-colors cursor-pointer"
              >
                {editingId ? 'حفظ التعديل' : 'إضافة الصنف'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
