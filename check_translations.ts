import { ROLE_SOP_DETAILS } from './components/constants';
import { DEFAULT_ROLE_GUIDES } from './constants/staff';
import { MODULE_DEFINITIONS, MODULE_SYSTEM_TASKS } from './components/constants';
import { STAFF_CONTENT_TRANSLATIONS, STAFF_MODULE_TRANSLATIONS } from './constants/staffTranslations';

const missingSOP = new Set<string>();
const missingGuides = new Set<string>();
const missingModules = new Set<string>();

// 1. SOP
Object.values(ROLE_SOP_DETAILS).forEach(role => {
    Object.values(role).forEach(timeSops => {
        timeSops.tasks.forEach((sop: any) => {
            if (sop.label && !STAFF_CONTENT_TRANSLATIONS[sop.label]) missingSOP.add(sop.label);
            if (sop.standard && !STAFF_CONTENT_TRANSLATIONS[sop.standard]) missingSOP.add(sop.standard);
            if (sop.why && !STAFF_CONTENT_TRANSLATIONS[sop.why]) missingSOP.add(sop.why);
        });
    });
});

Object.values(MODULE_SYSTEM_TASKS).forEach(mod => {
    mod.forEach(sop => {
        if (sop.label && !STAFF_CONTENT_TRANSLATIONS[sop.label]) missingSOP.add(sop.label);
        if (sop.standard && !STAFF_CONTENT_TRANSLATIONS[sop.standard]) missingSOP.add(sop.standard);
        if (sop.why && !STAFF_CONTENT_TRANSLATIONS[sop.why]) missingSOP.add(sop.why);
    });
});

// 2. Guides
Object.values(DEFAULT_ROLE_GUIDES).forEach(guide => {
    if (guide.duties) guide.duties.forEach((d: string) => { if (d && !STAFF_CONTENT_TRANSLATIONS[d]) missingGuides.add(d); });
    if (guide.coreValue && !STAFF_CONTENT_TRANSLATIONS[guide.coreValue]) missingGuides.add(guide.coreValue);
    if (guide.safetyRedLine && !STAFF_CONTENT_TRANSLATIONS[guide.safetyRedLine]) missingGuides.add(guide.safetyRedLine);
    if (guide.employeeRules) guide.employeeRules.forEach((d: string) => { if (d && !STAFF_CONTENT_TRANSLATIONS[d]) missingGuides.add(d); });
    if (guide.troubleshooting) guide.troubleshooting.forEach((t: any) => {
        if (t.issue && !STAFF_CONTENT_TRANSLATIONS[t.issue]) missingGuides.add(t.issue);
        if (t.solution && !STAFF_CONTENT_TRANSLATIONS[t.solution]) missingGuides.add(t.solution);
    });
});

// 3. Modules
Object.keys(MODULE_DEFINITIONS).forEach(modKey => {
    if (!STAFF_MODULE_TRANSLATIONS[modKey]) missingModules.add(modKey);
});

console.log("Missing SOP:", missingSOP.size);
console.log("Missing Guides:", missingGuides.size);
console.log("Missing Modules:", missingModules.size);

import * as fs from 'fs';
fs.writeFileSync('missing_translations.json', JSON.stringify({
  sop: Array.from(missingSOP),
  guides: Array.from(missingGuides),
  modules: Array.from(missingModules)
}, null, 2));

