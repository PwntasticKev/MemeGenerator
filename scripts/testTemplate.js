import { generateTemplate } from '../template.js';
import path from 'path';

async function testTemplate() {
    console.log('Testing Single Template...');
    
    const testData = {
        overlayPath: './assets/mainoverlay_1.png',
        image1: 'https://picsum.photos/400/600?random=11',
        image2: 'https://picsum.photos/400/600?random=12',
        fact: 'This is a test fact for the single template. It should be center-aligned and wrap properly if it gets too long.',
        reply: 'This is a test reply for the single template. It should be left-aligned and also wrap properly if the text is too long for the available space.',
        outputPath: './test_output/test_single_template_output.png',
        avatarPath: './assets/mainoverlay_1.png',
        handle: '@testuser',
        name: 'Test User'
    };

    try {
        console.log('Generating single template...');
        await generateTemplate(testData);
        console.log('✅ Single template test completed successfully!');
        console.log('📁 Output saved to:', testData.outputPath);
    } catch (error) {
        console.error('❌ Single template test failed:', error);
    }
}

testTemplate(); 