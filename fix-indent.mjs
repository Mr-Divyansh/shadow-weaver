import fs from 'fs';

const p = 'src/App.tsx';
let s = fs.readFileSync(p, 'utf8').split('\n');

// Collapse multiple consecutive blank lines into single blank line
for (let i = 0; i < s.length - 1; i++) {
  if (s[i] === '' && s[i+1] === '') {
    s.splice(i+1, 1);
    i--; // recheck
    console.log(`Collapsed double blank at line ${i+1}`);
  }
}


fs.writeFileSync(p, s.join('\n'));
console.log('Done');

// Verify lines 52-58
s = fs.readFileSync(p, 'utf8').split('\n');
console.log('Lines 52-58:');
for (let i = 51; i < 58 && i < s.length; i++) {
  console.log(`L${i+1}: "${s[i]}"`);
}