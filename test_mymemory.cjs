const http = require('http');
const https = require('https');

async function translate(text, tl) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh|${tl}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.responseData.translatedText;
}

translate('打烊管理', 'en').then(console.log);
