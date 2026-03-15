const fs = require('fs');

const content = fs.readFileSync('components/bcbas/BCBAForm.tsx', 'utf8');

console.log('✅ File verification:');
console.log('Has SignatureCanvas import:', content.includes('SignatureCanvas'));
console.log('Has signature state:', content.includes('const [signature'));
console.log('Has Signature section:', content.includes('Signature (Optional)'));
console.log('Has signature handlers:', content.includes('handleSaveSignature'));
console.log('File length:', content.length, 'characters');
console.log('Line count:', content.split('\n').length);
