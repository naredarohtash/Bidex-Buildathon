const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');

// 1. Rebrand .env files
const envFiles = [
  path.join(projectRoot, '.env'),
  path.join(projectRoot, '.env.example'),
  path.join(projectRoot, 'backend', '.env')
];

console.log('Rebranding .env files...');
envFiles.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace NEXT_PUBLIC_SITE_NAME
    content = content.replace(/NEXT_PUBLIC_SITE_NAME=["']Bicrypto["']/g, 'NEXT_PUBLIC_SITE_NAME="BIDEX"');
    
    // Replace NEXT_PUBLIC_SITE_DESCRIPTION
    content = content.replace(
      /NEXT_PUBLIC_SITE_DESCRIPTION=["']Bicrypto is a cryptocurrency exchange platform, where you can trade Bitcoin, Ethereum, Litecoin, and other cryptocurrencies\.["']/g,
      'NEXT_PUBLIC_SITE_DESCRIPTION="BIDEX is a cryptocurrency exchange platform, where you can trade Bitcoin, Ethereum, Litecoin, and other cryptocurrencies."'
    );
    
    // Fallback search-and-replace for Bicrypto -> BIDEX in site name / description fields
    content = content.replace(/NEXT_PUBLIC_SITE_NAME="Bicrypto"/g, 'NEXT_PUBLIC_SITE_NAME="BIDEX"');
    
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${file}`);
  } else {
    console.log(`Skipped (not found): ${file}`);
  }
});

// 2. Rebrand compiled JS backend files
const backendJsPaths = [
  'backend/dist/src',
  'backend/dist/dist/src'
];

backendJsPaths.forEach(basePath => {
  const fullPath = path.join(projectRoot, basePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`Directory does not exist: ${fullPath}`);
    return;
  }

  console.log(`Scanning JS files in: ${basePath}`);
  
  // File 1: utils/index.js
  const utilsIndexPath = path.join(fullPath, 'utils', 'index.js');
  if (fs.existsSync(utilsIndexPath)) {
    let content = fs.readFileSync(utilsIndexPath, 'utf8');
    
    // Replace app name, support email, backend status strings
    content = content.replace(/Bicrypto Backend Service/g, 'BIDEX Backend Service');
    content = content.replace(/support@mashdiv.com/g, 'support@bidex.com');
    content = content.replace(/bounces\+[\w.-]+@mashdiv\.com/g, 'support@bidex.com');
    content = content.replace(/This is the backend service for <strong>Bicrypto<\/strong>/g, 'This is the backend service for <strong>BIDEX</strong>');
    content = content.replace(/This is the backend service for <strong>\$\{exports\.appName\}<\/strong>/g, 'This is the backend service for <strong>${exports.appName}</strong>');
    
    // Extra safety replacements
    content = content.replace(/appName\|\|"Platform"/g, 'appName||"BIDEX"');
    content = content.replace(/appSupport\|\|"support@mashdiv\.com"/g, 'appSupport||"support@bidex.com"');
    content = content.replace(/support@mashdiv\.com/g, 'support@bidex.com');
    
    fs.writeFileSync(utilsIndexPath, content, 'utf8');
    console.log(`Updated: ${utilsIndexPath}`);
  }

  // File 2: utils/mailer.js
  const mailerPath = path.join(fullPath, 'utils', 'mailer.js');
  if (fs.existsSync(mailerPath)) {
    let content = fs.readFileSync(mailerPath, 'utf8');
    content = content.replace(/NEXT_PUBLIC_SITE_NAME\|\|"Bicrypto"/g, 'NEXT_PUBLIC_SITE_NAME||"BIDEX"');
    fs.writeFileSync(mailerPath, content, 'utf8');
    console.log(`Updated: ${mailerPath}`);
  }

  // File 3: cron/jobs/heartbeat.js
  const heartbeatPath = path.join(fullPath, 'cron', 'jobs', 'heartbeat.js');
  if (fs.existsSync(heartbeatPath)) {
    let content = fs.readFileSync(heartbeatPath, 'utf8');
    content = content.replace(/name:"Bicrypto"/g, 'name:"BIDEX"');
    fs.writeFileSync(heartbeatPath, content, 'utf8');
    console.log(`Updated: ${heartbeatPath}`);
  }

  // File 4: api/admin/system/utils.js
  const systemUtilsPath = path.join(fullPath, 'api', 'admin', 'system', 'utils.js');
  if (fs.existsSync(systemUtilsPath)) {
    let content = fs.readFileSync(systemUtilsPath, 'utf8');
    content = content.replace(/name:t\.name\|\|"bicrypto"/g, 'name:t.name||"bidex"');
    content = content.replace(/description:t\.description\|\|"BiCrypto Trading Platform"/g, 'description:t.description||"BIDEX Trading Platform"');
    fs.writeFileSync(systemUtilsPath, content, 'utf8');
    console.log(`Updated: ${systemUtilsPath}`);
  }

  // File 5: api/admin/system/license/status.get.js
  const statusGetPath = path.join(fullPath, 'api', 'admin', 'system', 'license', 'status.get.js');
  if (fs.existsSync(statusGetPath)) {
    let content = fs.readFileSync(statusGetPath, 'utf8');
    content = content.replace(/productName:"BiCrypto"/g, 'productName:"BIDEX"');
    fs.writeFileSync(statusGetPath, content, 'utf8');
    console.log(`Updated: ${statusGetPath}`);
  }

  // File 6: api/(ext)/gateway/integration/[pluginId]/download.get.js
  const downloadGetPath = path.join(fullPath, 'api', '(ext)', 'gateway', 'integration', '[pluginId]', 'download.get.js');
  if (fs.existsSync(downloadGetPath)) {
    let content = fs.readFileSync(downloadGetPath, 'utf8');
    content = content.replace(/Bicrypto Payment Gateway for WooCommerce/g, 'BIDEX Payment Gateway for WooCommerce');
    fs.writeFileSync(downloadGetPath, content, 'utf8');
    console.log(`Updated: ${downloadGetPath}`);
  }
});

console.log('Rebrand backend script execution completed.');
