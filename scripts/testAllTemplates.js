import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = './output';
const TEST_TOPIC = 'Test All Templates';

console.log('🧪 Starting comprehensive template test...\n');

// Step 1: Check if all SVG templates exist
console.log('📋 Step 1: Checking SVG templates...');
const templatesDir = './templates';
const svgTemplates = fs.readdirSync(templatesDir).filter(f => f.match(/^template\d+\.svg$/i));
console.log(`Found ${svgTemplates.length} SVG templates: ${svgTemplates.join(', ')}`);

if (svgTemplates.length === 0) {
    console.error('❌ No SVG templates found!');
    process.exit(1);
}

// Step 2: Run the meme generator for all templates
console.log('\n🎬 Step 2: Running meme generator for all templates...');
try {
    const command = `node scripts/generateMeme.js --all-templates --skip-review`;
    console.log(`Executing: ${command}`);
    
    const output = execSync(command, { 
        encoding: 'utf8',
        input: `${TEST_TOPIC}\n`,
        timeout: 300000 // 5 minutes timeout
    });
    
    console.log('✅ Meme generator completed successfully!');
    console.log('Output:', output);
    
} catch (error) {
    console.error('❌ Meme generator failed:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
    process.exit(1);
}

// Step 3: Find the latest output folder
console.log('\n📁 Step 3: Finding output folder...');
const dateFolders = fs.readdirSync(OUTPUT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f));
if (dateFolders.length === 0) {
    console.error('❌ No date folders found in output directory');
    process.exit(1);
}

const latestDate = dateFolders.sort().pop();
const latestDatePath = path.join(OUTPUT_DIR, latestDate);
const runFolders = fs.readdirSync(latestDatePath);

if (runFolders.length === 0) {
    console.error('❌ No run folders found in latest date folder');
    process.exit(1);
}

// Find the most recent run folder
let latestRunFolder = null;
let latestTime = 0;

for (const folder of runFolders) {
    const folderPath = path.join(latestDatePath, folder);
    const stat = fs.statSync(folderPath);
    if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
        latestRunFolder = folder;
    }
}

if (!latestRunFolder) {
    console.error('❌ Could not determine latest run folder');
    process.exit(1);
}

const outputFolder = path.join(latestDatePath, latestRunFolder);
console.log(`📂 Output folder: ${outputFolder}`);

// Step 4: Verify outputs for each template
console.log('\n✅ Step 4: Verifying outputs for each template...');
const files = fs.readdirSync(outputFolder);
console.log(`Files in output folder: ${files.join(', ')}`);

let allPassed = true;
const results = [];

for (const svgFile of svgTemplates) {
    const templateNum = svgFile.match(/template(\d+)\.svg/i)[1];
    console.log(`\n🔍 Checking template ${templateNum}...`);
    
    // Look for PNG and MP4 files for this template
    const pngFile = files.find(f => f.includes(`template${templateNum}_frame.png`));
    const mp4File = files.find(f => f.includes(`template${templateNum}_video.mp4`));
    
    const result = {
        template: templateNum,
        png: !!pngFile,
        mp4: !!mp4File,
        pngFile: pngFile || 'NOT FOUND',
        mp4File: mp4File || 'NOT FOUND'
    };
    
    results.push(result);
    
    if (pngFile) {
        console.log(`  ✅ PNG: ${pngFile}`);
    } else {
        console.log(`  ❌ PNG: NOT FOUND`);
        allPassed = false;
    }
    
    if (mp4File) {
        console.log(`  ✅ MP4: ${mp4File}`);
    } else {
        console.log(`  ❌ MP4: NOT FOUND`);
        allPassed = false;
    }
}

// Step 5: Summary
console.log('\n📊 Step 5: Test Summary');
console.log('='.repeat(50));

if (allPassed) {
    console.log('🎉 ALL TEMPLATES PASSED!');
    console.log(`✅ Generated ${results.length} templates successfully`);
    console.log(`✅ Each template has both PNG and MP4 files`);
} else {
    console.log('❌ SOME TEMPLATES FAILED!');
    console.log('\nFailed templates:');
    results.forEach(result => {
        if (!result.png || !result.mp4) {
            console.log(`  Template ${result.template}: PNG=${result.png ? '✅' : '❌'}, MP4=${result.mp4 ? '✅' : '❌'}`);
        }
    });
}

console.log('\n📁 Output location:', outputFolder);
console.log('🎬 You can now view all generated videos and images!');

if (!allPassed) {
    process.exit(1);
} 