
import { Employee } from '../types';

export const mapRoleToCode = (roleTitle: string): string => {
  if (!roleTitle) return 'PENDING';
  const t = roleTitle.toLowerCase().trim();
  
  if (t.includes('pending') || t.includes('待分配')) return 'PENDING';

  // --- MANAGEMENT ---
  if (t.includes('executive chef') || t.includes('行政总厨')) return 'EXEC_CHEF';
  if (t.includes('manager') || t.includes('经理')) return 'MANAGER';
  if (t.includes('supervisor') || t.includes('主管')) return 'SUPERVISOR';

  // --- KITCHEN (BOH) ---
  if (t.includes('head chef') || t.includes('头手')) return 'HEAD_CHEF';
  if (t.includes('assistant chef') || t.includes('帮锅') || t.includes('sous')) return 'ASST_CHEF';
  if (t.includes('kitchen cook') || t.includes('厨师')) return 'CHEF';
  if (t.includes('cutter') || t.includes('占板')) return 'CUTTER';
  if (t.includes('apprentice') || t.includes('学徒')) return 'APPRENTICE';
  if (t.includes('fryer') || t.includes('打荷') || t.includes('打河')) return 'FRYER';
  if (t.includes('commis') || t.includes('runner') || t.includes('马王')) return 'COMMIS';
  if (t.includes('helper') || t.includes('帮手')) return 'HELPER';
  if (t.includes('cleaner') && (t.includes('kitchen') || t.includes('厨房'))) return 'K_CLEANER';
  if (t.includes('dish') || t.includes('洗碗')) return 'DISHWASH';
  
  // --- BAR ---
  if (t.includes('water bar') || t.includes('水吧') || t.includes('bar')) return 'BAR';

  // --- FLOOR (FOH) ---
  if (t.includes('counter') || t.includes('柜台') || t.includes('cashier')) return 'COUNTER';
  if (t.includes('captain') || t.includes('写单')) return 'CAPTAIN';
  if (t.includes('waiter') || t.includes('服务员')) return 'WAITER';
  if (t.includes('cleaner') || t.includes('清洁')) return 'CLEANER';
  if (t.includes('part') || t.includes('兼职') || t.includes('pt')) return 'PART_TIME';
  
  // --- OWNER ---
  if (t.includes('owner') || t.includes('老板')) return 'OWNER';

  return 'PENDING';
};

export const getLevelDisplay = (level: string) => {
    switch(level) {
      case 'In-Charge':
      case '负责人': return '负责人 (PIC)';
      case '资深': return '资深 (Senior)';
      case '正式': return '正式 (Official)';
      case '新手': return '新手 (Novice)';
      case '试用期': return '试用 (Probation)';
      default: return level;
    }
};

export const getChineseRoleName = (fullRole: string): string => {
   // Use Regex to extract Chinese characters if available
   const match = fullRole.match(/[\u4e00-\u9fa5]+/g);
   if (match) return match.join('');
   // Fallback: Remove content in brackets
   return fullRole.split('(')[0].trim();
};

/**
 * UPLOAD TO CLOUDINARY
 */
export const uploadToCloudinary = async (file: File): Promise<string> => {
    const config = JSON.parse(localStorage.getItem('kepong_erp_config') || '{}');
    const cloudName = config.cloudinaryCloudName || 'dp9vqajqu'; 
    const uploadPreset = config.cloudinaryUploadPreset || 'kepong_unsigned'; 

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Error:", error);
        throw error;
    }
};
