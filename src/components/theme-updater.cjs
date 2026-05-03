const fs = require('fs');
const path = require('path');

const componentsDir = 'c:\\Users\\kenan\\Documents\\inaner-tr\\tir-muhasebe-v2\\src\\components';

const colorMap = {
    'Dashboard.jsx': 'violet',
    'Trips.jsx': 'sky',
    'Fuel.jsx': 'cyan',
    'Maintenance.jsx': 'amber',
    'Detaylar.jsx': 'red',
    'Invoices.jsx': 'emerald',
    'Payments.jsx': 'green',
    'CompanyAdmin.jsx': 'indigo',
    'SuperAdmin.jsx': 'fuchsia',
    'AdminLog.jsx': 'slate',
    'Settings.jsx': 'zinc'
};

for (const [file, color] of Object.entries(colorMap)) {
    const filePath = path.join(componentsDir, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // We only replace 'brand-' with `${color}-`
        const regex = /brand-/g;
        const newContent = content.replace(regex, `${color}-`);
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${file} with color ${color}`);
    } else {
        console.log(`File not found: ${file}`);
    }
}
