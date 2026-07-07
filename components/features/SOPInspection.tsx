
import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, User, Search, RefreshCcw, Filter } from 'lucide-react';
import { Employee, SOPItem } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';

export const SOPInspection: React.FC = () => {
    const [staffList, setStaffList] = useState<Employee[]>([]);
    const [sopData, setSopData] = useState<Record<string, SOPItem[]>>({});
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadData = async () => {
            // 1. Get Employees
            const allStaff = await DataManager.getEmployees();
            
            // Filter Helper: Exclude Owners
            const activeStaff = allStaff.filter(s => 
               !s.isArchived && 
               !s.role.includes('Owner') &&
               !s.role.includes('老板')
            );
            
            setStaffList(activeStaff);

            // 2. Get Today's Progress
            const now = new Date();
            if (now.getHours() < 4) now.setDate(now.getDate() - 1);
            const dateStr = now.toISOString().split('T')[0];

            const data: Record<string, SOPItem[]> = {};
            for (const s of activeStaff) {
                const items = await DataManager.getSOPProgress(dateStr, s.id);
                if (items) {
                    data[s.id] = items;
                }
            }
            setSopData(data);
        };
        loadData();
    }, []);

    const filteredStaff = useMemo(() => {
        return staffList.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            s.id.includes(searchTerm) ||
            s.role.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [staffList, searchTerm]);

    const handleResetAll = async () => {
        if (!confirm("确定要重置今日所有员工的 SOP 进度吗？\n(Reset All Staff Progress)")) return;
        
        const now = new Date();
        if (now.getHours() < 4) now.setDate(now.getDate() - 1);
        const dateStr = now.toISOString().split('T')[0];

        for(const s of staffList) {
            const current = sopData[s.id];
            if (current) {
                const reset = current.map(item => ({ ...item, completed: false }));
                await DataManager.saveSOPProgress(dateStr, s.id, reset);
            }
        }
        window.location.reload();
    };

    const getRoleShortName = (role: string) => role.split('(')[0].trim().toUpperCase();

    return (
        <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-24">
          
          {/* HEADER & SEARCH */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                    <h3 className="font-black text-xl text-[#1A1A1A] flex items-center gap-2">
                        <ClipboardCheck className="text-brandRed" size={24} /> 
                        全员 SOP 进度稽查
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Staff Performance Monitoring</p>
                </div>
                <div className="flex gap-2">
                    <ModuleGuideButton module="SOP" dark />
                    <button onClick={handleResetAll} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors">
                        <RefreshCcw size={14}/> 重置全员进度
                    </button>
                </div>
             </div>

             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="搜索名字、ID 或 职位..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/10 transition-all"
                />
             </div>
          </div>

          {/* INSPECTION GRID */}
          {filteredStaff.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                  <User size={48} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-gray-400 font-bold">未找到相关员工数据</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredStaff.map(staff => {
                      const items = sopData[staff.id] || [];
                      const completedCount = items.filter(i => i.completed).length;
                      const totalCount = items.length;
                      const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                      const isFullyDone = progress === 100 && totalCount > 0;

                      return (
                          <div key={staff.id} className="bg-[#EBEEF2] rounded-[2rem] p-6 shadow-sm flex flex-col hover:shadow-md transition-shadow relative group">
                              
                              {/* Card Header */}
                              <div className="flex justify-between items-start mb-6">
                                  <div className="flex items-center gap-3">
                                      <div className={`w-3 h-3 rounded-full ${isFullyDone ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`}></div>
                                      <div>
                                          <h4 className="font-black text-lg text-[#1A1A1A] leading-tight flex items-center gap-2">
                                              {getRoleShortName(staff.role)}
                                          </h4>
                                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                              #{staff.id} • {staff.name}
                                          </div>
                                      </div>
                                  </div>
                                  <div className={`text-xl font-black font-mono ${isFullyDone ? 'text-green-600' : 'text-gray-600'}`}>
                                      {progress}%
                                  </div>
                              </div>

                              <div className="h-px bg-gray-200/50 mb-6"></div>

                              {/* Task List */}
                              <div className="space-y-4 flex-grow">
                                  {items.length === 0 ? (
                                      <div className="py-10 text-center text-gray-400 text-xs italic">尚未开始任务</div>
                                  ) : (
                                      items.map(item => (
                                          <div key={item.id} className="flex items-center gap-3 group/item">
                                              {item.completed ? (
                                                  <div className="w-6 h-6 rounded-full bg-white border-2 border-green-500 flex items-center justify-center text-green-500 shrink-0">
                                                      <CheckCircle2 size={16} strokeWidth={3} />
                                                  </div>
                                              ) : (
                                                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                                                      <div className="w-1.5 h-1.5 bg-gray-200 rounded-full"></div>
                                                  </div>
                                              )}
                                              <span className={`text-sm font-bold leading-tight ${item.completed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                                  {item.label}
                                              </span>
                                          </div>
                                      ))
                                  )}
                              </div>

                              {/* Decorative Bar at bottom */}
                              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-200 overflow-hidden rounded-b-[2rem]">
                                  <div 
                                    className={`h-full transition-all duration-1000 ${isFullyDone ? 'bg-green-500' : 'bg-primary'}`} 
                                    style={{ width: `${progress}%` }}
                                  />
                              </div>
                          </div>
                      )
                  })}
              </div>
          )}
        </div>
    );
}
