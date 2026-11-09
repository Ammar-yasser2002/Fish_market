import React, { useState } from 'react';
import { Contact, ContactType } from '../types';
import { User, ShoppingBag, Plus, Trash2, Edit2, Phone, Search } from 'lucide-react';

interface ContactsManagerProps {
  contacts: Contact[];
  onAddContact: (contact: Partial<Contact>) => Contact;
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
}

export const ContactsManager: React.FC<ContactsManagerProps> = ({
  contacts,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'seller' | 'buyer' | 'worker'>('all');
  const [search, setSearch] = useState('');

  // Form modal
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>('seller');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = contacts.filter((c) => {
    if (filterType !== 'all') {
      if (filterType === 'seller' && c.type !== 'seller' && c.type !== 'both') return false;
      if (filterType === 'buyer' && c.type !== 'buyer' && c.type !== 'both') return false;
      if (filterType === 'worker' && c.type !== 'worker') return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
      );
    }
    return true;
  });

  const handleOpenAdd = (defaultType: ContactType = 'seller') => {
    setEditingId(null);
    setName('');
    setType(defaultType);
    setPhone('');
    setNotes('');
    setIsOpenModal(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setType(contact.type);
    setPhone(contact.phone || '');
    setNotes(contact.notes || '');
    setIsOpenModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      const existing = contacts.find((c) => c.id === editingId);
      if (existing) {
        onUpdateContact({
          ...existing,
          name: name.trim(),
          type,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
    } else {
      onAddContact({
        name: name.trim(),
        type,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }

    setIsOpenModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter */}
      <div className="bg-white border border-slate-300 rounded-none p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">قسم الصياد والمشترين (جهات الاتصال)</h2>
            <p className="text-xs text-slate-500">إدارة بيانات الصيادين، والمشترين وتجار الأسواق</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="add-seller-btn"
              type="button"
              onClick={() => handleOpenAdd('seller')}
              className="px-3.5 py-2 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ صياد جديد</span>
            </button>
            <button
              id="add-buyer-btn"
              type="button"
              onClick={() => handleOpenAdd('buyer')}
              className="px-3.5 py-2 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ مشتري جديد</span>
            </button>
            <button
              id="add-worker-btn"
              type="button"
              onClick={() => handleOpenAdd('worker')}
              className="px-3.5 py-2 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ عامل سوق جديد</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="البحث بالاسم أو رقم الجوال..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-none pr-9 pl-4 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300 text-xs">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                filterType === 'all' ? 'text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={filterType === 'all' ? { backgroundColor: '#030164' } : undefined}
            >
              الكل ({contacts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('seller')}
              className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                filterType === 'seller' ? 'text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={filterType === 'seller' ? { backgroundColor: '#030164' } : undefined}
            >
              الصيادين والمراكب ({contacts.filter((c) => (c.type === 'seller' || c.type === 'both') && c.type !== 'worker').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('buyer')}
              className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                filterType === 'buyer' ? 'text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={filterType === 'buyer' ? { backgroundColor: '#030164' } : undefined}
            >
              المشترين ({contacts.filter((c) => (c.type === 'buyer' || c.type === 'both') && c.type !== 'worker').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('worker')}
              className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                filterType === 'worker' ? 'text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={filterType === 'worker' ? { backgroundColor: '#030164' } : undefined}
            >
              عمال وموظفي السوق ({contacts.filter((c) => c.type === 'worker').length})
            </button>
          </div>
        </div>

        {/* Contacts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {filtered.map((c) => {
            const isSeller = c.type === 'seller' || c.type === 'both';
            const isBuyer = c.type === 'buyer' || c.type === 'both';
            const isWorker = c.type === 'worker';

            return (
              <div
                key={c.id}
                className="bg-white border border-slate-300 rounded-none p-4 space-y-3 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-sm text-slate-900">{c.name}</span>
                      {isSeller && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          صياد
                        </span>
                      )}
                      {isBuyer && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-300">
                          مشتري
                        </span>
                      )}
                      {isWorker && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          عامل سوق
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                      className="p-1 rounded-none text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteContact(c.id)}
                      className="p-1 rounded-none text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {c.phone && (
                  <div className="text-xs text-slate-600 flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span dir="ltr">{c.phone}</span>
                  </div>
                )}

                {c.notes && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-none border border-slate-300 truncate">
                    {c.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add/Edit Contact */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-300 rounded-none p-6 max-w-md w-full space-y-4 shadow-xl animate-in fade-in zoom-in-95"
          >
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              {editingId ? 'تعديل بيانات جهة الاتصال' : 'إضافة جهة اتصال جديدة'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">نوع الحساب *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('seller')}
                    className={`p-2 rounded-none font-bold text-xs border transition-colors cursor-pointer ${
                      type === 'seller'
                        ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    صياد (-3%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('buyer')}
                    className={`p-2 rounded-none font-bold text-xs border transition-colors cursor-pointer ${
                      type === 'buyer'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    مشتري (+2%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('both')}
                    className={`p-2 rounded-none font-bold text-xs border transition-colors cursor-pointer ${
                      type === 'both'
                        ? 'bg-blue-800 border-blue-800 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    صياد ومشتري
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('worker')}
                    className={`p-2 rounded-none font-bold text-xs border transition-colors cursor-pointer ${
                      type === 'worker'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    عامل / موظف سوق
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: الصياد صالح بن عثمان"
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">رقم الجوال</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0500000000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الحراج أو طريقة السداد..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                {editingId ? 'حفظ التعديلات' : 'إضافة جهة الاتصال'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
