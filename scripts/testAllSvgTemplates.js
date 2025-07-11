import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = './output';
const TEST_TOPIC = 'Test All Templates';

function getAllSvgTemplates() {
  const files = fs.readdirSync('./templates');
  return files.filter(f => f.match(/^template\d+\.svg$/i));
}

function findLatestOutputFolder() {
  const dateFolders = fs.readdirSync(OUTPUT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f));
  let latest = null;
  let latestTime = 0;
  for (const dateFolder of dateFolders) {
    const subfolders = fs.readdirSync(path.join(OUTPUT_DIR, dateFolder));
    for (const sub of subfolders) {
      // Look for folders that contain template outputs (folders with timestamp that contain template files)
      if (sub.match(/\\d{14}$/)) {
        const fullPath = path.join(OUTPUT_DIR, dateFolder, sub);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > latestTime) {
          latest = fullPath;
          latestTime = stat.mtimeMs;
        }
      }
    }
  }
  return latest;
}

async function testAllSvgTemplates() {
  console.log('🧪 Running meme generator for all SVG templates...');
  try {
    execSync(`node scripts/generateMeme.js --all-templates --skip-review`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Meme generator failed to run:', e.message);
    process.exit(1);
  }

  const templates = getAllSvgTemplates();
  let allPassed = true;
  
  // Find the latest output folder that contains all template outputs
  const folder = findLatestOutputFolder();
  if (!folder) {
    console.error(`❌ No output folder found with template outputs`);
    process.exit(1);
  }
  
  console.log(`📁 Checking outputs in: ${folder}`);
  
  for (const svgFile of templates) {
    const templateNum = svgFile.match(/template(\d+)\.svg/i)[1];
    const png = fs.readdirSync(folder).find(f => f.includes(`_template${templateNum}_frame.png`));
    const mp4 = fs.readdirSync(folder).find(f => f.includes(`_template${templateNum}_video.mp4`));
    if (!png) {
      console.error(`❌ PNG not found for template${templateNum} in ${folder}`);
      allPassed = false;
    } else {
      console.log(`✅ PNG found for template${templateNum}: ${png}`);
    }
    if (!mp4) {
      console.error(`❌ MP4 not found for template${templateNum} in ${folder}`);
      allPassed = false;
    } else {
      console.log(`✅ MP4 found for template${templateNum}: ${mp4}`);
    }
  }
  if (allPassed) {
    console.log('🎉 All SVG templates generated PNG and MP4 successfully!');
    process.exit(0);
  } else {
    console.error('❌ Some templates failed to generate PNG or MP4. See errors above.');
    process.exit(1);
  }
}

testAllSvgTemplates(); 