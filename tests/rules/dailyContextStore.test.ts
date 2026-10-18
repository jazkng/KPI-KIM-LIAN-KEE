import {beforeAll,afterAll,expect,it} from 'vitest';
import {getFirestore} from 'firebase-admin/firestore';
import {initFirebaseAdmin,adminApp} from '../../server/firebaseAdmin';
import {firestoreContextStore} from '../../server/context/service';
const date='2099-01-01';
beforeAll(async()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator required');initFirebaseAdmin(true);await getFirestore(adminApp()).collection('v2DailyContext').doc(date).delete();});
afterAll(async()=>{await getFirestore(adminApp()).collection('v2DailyContext').doc(date).delete();});
it('emulator transaction admits only one request for a shared daily key',async()=>{const store=firestoreContextStore('MY-14');const results=await Promise.all(Array.from({length:6},()=>store.claim(date,'2099-01-01T07:00:00Z')));expect(results.filter(Boolean)).toHaveLength(1);expect(await store.get(date)).toBeNull();});
