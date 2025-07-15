import { template1 } from '../templates/template1.js';
import path from 'path';

async function testTemplate1() {
    console.log('Testing Template 1...');
    
    const testData = {
        overlayPath: './assets/mainoverlay_1.png',
        image1: 'https://picsum.photos/400/600?random=11',
        image2: 'https://picsum.photos/400/600?random=12',
        fact: 'This is a test fact for template 1. It should be center-aligned and wrap properly if it gets too long.',
        reply: 'This is a test reply for template 1. It should be left-aligned and also wrap properly if the text is too long for the available space.',
        outputPath: './test_output/test_template1_output.png',
        debugSvgPath: './test_output/test_template1_debug.svg',
        avatarPath: './assets/mainoverlay_1.png',
        handle: '@testuser',
        name: 'Test User'
    };

    try {
        console.log('Generating template 1...');
        await template1(testData);
        console.log('✅ Template 1 test completed successfully!');
        console.log('📁 Output saved to:', testData.outputPath);
        console.log('📁 Debug SVG saved to:', testData.debugSvgPath);
    } catch (error) {
        console.error('❌ Template 1 test failed:', error);
    }
}

testTemplate1(); 