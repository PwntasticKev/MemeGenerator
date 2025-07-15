import { template2 } from '../templates/template2.js';
import path from 'path';

async function testTemplate2() {
    console.log('Testing Template 2...');
    
    const testData = {
        overlayPath: './assets/mainoverlay_1.png',
        image1: 'https://picsum.photos/400/600?random=1',
        image2: 'https://picsum.photos/400/600?random=2',
        fact: 'This is a test fact for template 2. It should be center-aligned in the top white container and wrap properly if it gets too long.',
        reply: 'This is a test reply for template 2. It should be left-aligned in the bottom white container and also wrap properly if the text is too long for the available space.',
        outputPath: './test_output/test_template2_output.png',
        debugSvgPath: './test_output/test_template2_debug.svg',
        avatarPath: './assets/mainoverlay_1.png',
        handle: '@testuser',
        name: 'Test User'
    };

    try {
        console.log('Generating template 2...');
        await template2(testData);
        console.log('✅ Template 2 test completed successfully!');
        console.log('📁 Output saved to:', testData.outputPath);
        console.log('📁 Debug SVG saved to:', testData.debugSvgPath);
    } catch (error) {
        console.error('❌ Template 2 test failed:', error);
    }
}

// Run the test
testTemplate2(); 