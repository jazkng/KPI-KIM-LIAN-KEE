const fs = require('fs');

const missing = JSON.parse(fs.readFileSync('missing_translations.json', 'utf8'));

let contentOut = 'const NEW_CONTENT_TRANSLATIONS = {\n';
for (const text of missing.sop) {
    contentOut += `  ${JSON.stringify(text)}: { zh: ${JSON.stringify(text)}, en: "", my: "" },\n`;
}
for (const text of missing.guides) {
    contentOut += `  ${JSON.stringify(text)}: { zh: ${JSON.stringify(text)}, en: "", my: "" },\n`;
}
contentOut += '};\n\n';

let modulesOut = 'const NEW_MODULE_TRANSLATIONS = {\n';
for (const text of missing.modules) {
    modulesOut += `  ${JSON.stringify(text)}: {\n    label: { zh: "", en: "", my: "" },\n    desc: { zh: "", en: "", my: "" },\n    guide: { zh: "", en: "", my: "" }\n  },\n`;
}
modulesOut += '};\n';

fs.writeFileSync('template.ts', contentOut + modulesOut);
