// 设定 / 取消库存商品的「常用供应商与包装」：只改 preferredSupply 一个字段，不动其他资料
import { deleteField, doc, updateDoc, type Firestore } from 'firebase/firestore';
import type { StockItem } from '../../types';
import { STOCK_AREA_COLLECTION, type StockArea } from './stockArea';

export const setPreferredSupply = async (
    db: Firestore, area: StockArea, stockId: string,
    value: { supplierId: string; catalogItemId: string } | null, by: string,
): Promise<StockItem['preferredSupply'] | undefined> => {
    const ref = doc(db, STOCK_AREA_COLLECTION[area], stockId);
    if (!value) {
        await updateDoc(ref, { preferredSupply: deleteField() });
        return undefined;
    }
    const preferredSupply = { ...value, setAt: new Date().toISOString(), setBy: by };
    await updateDoc(ref, { preferredSupply });
    return preferredSupply;
};
