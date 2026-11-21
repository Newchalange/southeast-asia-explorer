// Loads the real catalog from index.html for tests, without running the app.
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../chat-engine.js');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
const source=scripts.join('\n');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const places'),source.indexOf('const suggested')),context);
vm.runInContext(source.slice(source.indexOf('const hotelCandidates'),source.indexOf('const hotelAreas')),context);
const data=vm.runInContext('({places,hotelCandidates,hotelAreaCoords})',context);
const items=engine.catalog(data.places,data.hotelCandidates,data.hotelAreaCoords);
module.exports={html,scripts,data,items};
