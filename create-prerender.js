const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '.next', 'prerender-manifest.json');
const manifestDir = path.dirname(manifestPath);

// Ensure .next directory exists
if (!fs.existsSync(manifestDir)) {
  fs.mkdirSync(manifestDir, { recursive: true });
}

// Create the prerender manifest
const manifest = {
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: '',
    previewModeSigningKey: '',
    previewModeEncryptionKey: ''
  }
};

try {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Created prerender-manifest.json');
} catch (error) {
  console.error('❌ Error creating prerender-manifest.json:', error.message);
  process.exit(1);
}
