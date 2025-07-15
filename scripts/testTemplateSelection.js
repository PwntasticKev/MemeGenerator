import { getAllSvgTemplates } from './generateMeme.js';

console.log('🧪 Testing Template Selection Functionality');
console.log('===========================================\n');

// Test 1: Check available templates
console.log('📋 Test 1: Available templates');
const templates = getAllSvgTemplates();
console.log(`Found ${templates.length} SVG templates:`);
templates.forEach((template, index) => {
    const templateNum = template.match(/template(\d+)\.svg/i)[1];
    console.log(`  ${index + 1}. ${template} (Template ${templateNum})`);
});

// Test 2: Test command line argument parsing
console.log('\n📋 Test 2: Command line argument parsing');
const testArgs = [
    '--template=1',
    '--template=2', 
    '--template=5',
    '--template=invalid',
    '--other-arg=value'
];

testArgs.forEach(arg => {
    const templateMatch = arg.match(/--template=(\d+)/);
    if (templateMatch) {
        const templateNum = templateMatch[1];
        console.log(`  "${arg}" -> Template ${templateNum}`);
    } else {
        console.log(`  "${arg}" -> No template specified`);
    }
});

// Test 3: Template validation
console.log('\n📋 Test 3: Template validation');
const validTemplates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const invalidTemplates = [0, 11, 99, -1];

validTemplates.forEach(num => {
    const isValid = num >= 1 && num <= templates.length;
    console.log(`  Template ${num}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
});

console.log('\n✅ Template selection test completed!');
console.log('\nTo test the actual functionality:');
console.log('  npm run template1    # Use template 1');
console.log('  npm run template2    # Use template 2');
console.log('  npm start            # Interactive template selection');
console.log('  node scripts/generateMeme.js --template=3  # Use template 3'); 