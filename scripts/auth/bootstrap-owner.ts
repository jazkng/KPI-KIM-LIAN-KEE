// ============================================================================
// CHG-05 · 建立第一位老板（一次性管理指令，取代网页上的「初始化系统」按钮）
// ----------------------------------------------------------------------------
// 只有系统完全没有员工、且从未执行过时才会建立；在 Firestore 交易中检查 system/bootstrap 哨兵文件，
// 已存在或已有任何员工就停止，保证只执行一次。
// 产生 6 位临时 PIN：登录后必须先改 PIN 才能取得正式身份。
//
// 用法：
//   Emulator： USE_EMULATOR=true npx tsx scripts/auth/bootstrap-owner.ts --name "老板姓名"
//   正式环境：由负责人在具备 GCP 权限的环境执行（需要负责人批准，不在 CI 或自动化中执行）：
//              FIREBASE_PROJECT_ID=<项目> npx tsx scripts/auth/bootstrap-owner.ts --name "老板姓名" --confirm-production
// ============================================================================
import crypto from 'crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '../../server/firebaseAdmin';
import { hashPin } from '../../server/auth/authCore';

const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
};

const main = async () => {
    const emulator = process.env.USE_EMULATOR === 'true';
    if (!emulator && !process.argv.includes('--confirm-production')) {
        console.error('非 Emulator 环境必须加上 --confirm-production（需负责人批准）。');
        process.exit(2);
    }
    const name = (arg('--name') || '').trim();
    if (!name) {
        console.error('请用 --name 提供老板姓名。');
        process.exit(2);
    }
    const db = getFirestore(initFirebaseAdmin(emulator));
    const tempPin = String(crypto.randomInt(100000, 1000000));
    const today = new Date().toISOString().slice(0, 10);

    const created = await db.runTransaction(async tx => {
        const sentinel = db.collection('system').doc('bootstrap');
        const [s, anyEmployee] = await Promise.all([tx.get(sentinel), tx.get(db.collection('employees').limit(1))]);
        if (s.exists || !anyEmployee.empty) return false;
        tx.set(db.collection('employees').doc('001'), {
            id: '001',
            name,
            role: 'Owner (老板)',
            orgLevel: 'OWNER',
            status: 'CONFIRMED',
            joinDate: today,
            // 过渡期 V1 仍比对 employees.pin；同步写入同一个临时 PIN，避免 V1 以「没有 PIN = 8888」放行
            pin: tempPin,
        });
        tx.set(db.collection('employee_secrets').doc('001'), { pinHash: hashPin(tempPin), mustChange: true, updatedAt: FieldValue.serverTimestamp() });
        tx.set(sentinel, { createdAt: FieldValue.serverTimestamp(), by: 'scripts/auth/bootstrap-owner.ts', ownerId: '001' });
        return true;
    });

    if (!created) {
        console.log('系统已有员工或已初始化过，未做任何变更。');
        return;
    }
    console.log(`已建立老板 001（${name}）。临时 PIN：${tempPin}`);
    console.log('请以员工编号 001 与临时 PIN 登录，系统会要求立即设定新的 6 位 PIN。临时 PIN 只显示这一次。');
};

main().catch(e => {
    console.error('执行失败：', (e as Error).message);
    process.exit(1);
});
