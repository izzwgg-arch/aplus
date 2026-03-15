const fs = require('fs');
const path = require('path');

// Copy PDFKit font files to .next/server/chunks/data/ after build
const sourceDir = path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data');
const targetDir = path.join(__dirname, '.next', 'server', 'chunks', 'data');

console.log('📁 Copying PDFKit fonts...');
console.log('Source:', sourceDir);
console.log('Target:', targetDir);

try {
  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log('✅ Created target directory');
  }

  // Get all .afm font files
  const fontFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.afm'));
  console.log(`Found ${fontFiles.length} font files`);

  // Copy each font file
  let copied = 0;
  fontFiles.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    
    try {
      fs.copyFileSync(sourcePath, targetPath);
      copied++;
      console.log(`  ✅ Copied ${file}`);
    } catch (error) {
      console.error(`  ❌ Failed to copy ${file}:`, error.message);
    }
  });

  console.log(`✅ Successfully copied ${copied}/${fontFiles.length} font files`);
} catch (error) {
  console.error('❌ Error copying PDFKit fonts:', error.message);
  process.exit(1);
}
