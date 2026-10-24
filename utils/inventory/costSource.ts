import { collection, getDocs, type Firestore } from 'firebase/firestore';
import type { StockItem } from '../../types';

// Preserve missing source fields: business normalization supplies defaults unsuitable for an audit.
export const readRawCostStock = async (db: Firestore): Promise<StockItem[]> => {
    const groups = await Promise.all(['stock_kitchen', 'stock_bar', 'stock_general', 'stock_fuel'].map(async name => {
        const snapshot = await getDocs(collection(db, name));
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id } as StockItem));
    }));
    return groups.flat();
};
