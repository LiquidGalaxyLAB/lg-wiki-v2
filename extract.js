const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\DEV\\.gemini\\antigravity-ide\\brain\\e17bf151-60a8-4df5-a4ab-2ae34327313d\\.system_generated\\logs\\transcript.jsonl', 'utf8').split('\n');
let lastUser = '';
for (let line of lines) {
  if (line.trim()) {
    const obj = JSON.parse(line);
    if (obj.type === 'USER_INPUT') {
      lastUser = obj.content;
    }
  }
}
const svgs = lastUser.match(/<svg[\s\S]*?<\/svg>/g);
if (svgs && svgs.length >= 2) {
  fs.writeFileSync('d:\\Antigravity_projects\\service-account-contribution-portal\\public\\assets\\google-search.svg', svgs[svgs.length-1], 'utf8');
  console.log("Success");
} else {
  console.log("No SVGs found");
}
