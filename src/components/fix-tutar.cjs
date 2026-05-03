const fs = require('fs');
let c = fs.readFileSync('c:/Users/kenan/Documents/inaner-tr/tir-muhasebe-v2/src/components/Fuel.jsx', 'utf8');

// Tablo - ana tutar satiri: text-cyan-400 font-bold text-sm (sadece tutar display)
c = c.replace('className="text-cyan-400 font-bold text-sm">', '₺{record.price.toLocaleString', 'className="text-orange-400 font-bold text-sm">');

// Daha guvenli: belirli satirlari hedef al
// Tablo satiri (line ~428): text-cyan-400 font-bold text-sm => text-orange-400
// Bu satir: <div className="text-cyan-400 font-bold text-sm">₺{record.price.toLocaleString
c = c.replace(
  '<div className="text-cyan-400 font-bold text-sm">₺{record.price.toLocaleString',
  '<div className="text-orange-400 font-bold text-sm">₺{record.price.toLocaleString'
);

// Tablo - km maliyeti (line ~431-433): text-[10px] text-cyan-400 mt-0.5 font-medium
c = c.replace(
  'className="text-[10px] text-cyan-400 mt-0.5 font-medium">\n                                                ₺{record.consumptionStats.costPerKm',
  'className="text-[10px] text-orange-400 mt-0.5 font-medium">\n                                                ₺{record.consumptionStats.costPerKm'
);

// Mobil - TUTAR bolumu (line ~517): text-cyan-400 font-bold text-sm w-full text-right
c = c.replace(
  '<div className="text-cyan-400 font-bold text-sm w-full text-right">₺{parseFloat(record.price)',
  '<div className="text-orange-400 font-bold text-sm w-full text-right">₺{parseFloat(record.price)'
);

// Mobil - km maliyeti (line ~534): text-cyan-400 font-bold text-xs w-full text-right
c = c.replace(
  '<div className="text-cyan-400 font-bold text-xs w-full text-right">₺{record.consumptionStats.costPerKm',
  '<div className="text-orange-400 font-bold text-xs w-full text-right">₺{record.consumptionStats.costPerKm'
);

fs.writeFileSync('c:/Users/kenan/Documents/inaner-tr/tir-muhasebe-v2/src/components/Fuel.jsx', c);
console.log('Fuel.jsx tutar renkleri eski haline geri dondu!');
