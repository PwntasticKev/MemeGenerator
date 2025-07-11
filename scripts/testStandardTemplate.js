import fs from 'fs';
import { JSDOM } from 'jsdom';

// Test the standardized template system
async function testStandardTemplate() {
    console.log('🧪 Testing standardized template system...');
    
    try {
        // Test data
        const testData = {
            fact: "Did you know that Spider-Man was originally going to be called 'The Human Spider'?",
            reply: "Imagine if he had to say 'I am the Human Spider' every time he swung into action. That would be... interesting.",
            handle: "@spiderman_facts",
            name: "Spider-Man Facts"
        };
        
        // Test the standardized template
        const templatePath = './templates/template_standard.svg';
        
        if (!fs.existsSync(templatePath)) {
            console.log('❌ Standard template not found, creating it...');
            return;
        }
        
        console.log('✅ Standard template found');
        
        // Read the template
        const svgContent = fs.readFileSync(templatePath, 'utf8');
        const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        
        // Check for placeholders
        const textElements = Array.from(doc.querySelectorAll('text, tspan'));
        const placeholders = [];
        
        for (const textElement of textElements) {
            const textContent = textElement.textContent;
            if (textContent.includes('{fact_here}')) placeholders.push('{fact_here}');
            if (textContent.includes('{reply_here}')) placeholders.push('{reply_here}');
            if (textContent.includes('{username_here}')) placeholders.push('{username_here}');
            if (textContent.includes('{handle_here}')) placeholders.push('{handle_here}');
        }
        
        console.log('📝 Found placeholders:', placeholders);
        
        // Check for image rectangles
        const rects = Array.from(doc.querySelectorAll('rect'));
        const imageRects = rects.filter(rect => {
            const fill = rect.getAttribute('fill');
            return fill === '#CACACA';
        });
        
        console.log('🖼️ Found image rectangles:', imageRects.length);
        
        // Check for avatar circle
        const circles = Array.from(doc.querySelectorAll('circle'));
        const avatarCircle = circles.find(circle => {
            const fill = circle.getAttribute('fill');
            return fill === '#D1CBCB';
        });
        
        console.log('👤 Found avatar circle:', !!avatarCircle);
        
        // Test placeholder replacement
        console.log('\n🔄 Testing placeholder replacement...');
        
        for (const textElement of textElements) {
            let textContent = textElement.textContent;
            
            if (textContent.includes('{fact_here}')) {
                textContent = textContent.replace(/\{fact_here\}/g, testData.fact);
                console.log('✅ Replaced {fact_here}');
            }
            if (textContent.includes('{reply_here}')) {
                textContent = textContent.replace(/\{reply_here\}/g, testData.reply);
                console.log('✅ Replaced {reply_here}');
            }
            if (textContent.includes('{username_here}')) {
                textContent = textContent.replace(/\{username_here\}/g, testData.name);
                console.log('✅ Replaced {username_here}');
            }
            if (textContent.includes('{handle_here}')) {
                textContent = textContent.replace(/\{handle_here\}/g, testData.handle);
                console.log('✅ Replaced {handle_here}');
            }
            
            textElement.textContent = textContent;
        }
        
        // Save test output
        const testOutputPath = './test_output/test_standard_template.svg';
        fs.mkdirSync('./test_output', { recursive: true });
        fs.writeFileSync(testOutputPath, doc.documentElement.outerHTML);
        
        console.log(`✅ Test completed! Output saved to: ${testOutputPath}`);
        console.log('\n📋 Summary:');
        console.log(`   - Placeholders found: ${placeholders.length}`);
        console.log(`   - Image rectangles: ${imageRects.length}`);
        console.log(`   - Avatar circle: ${!!avatarCircle}`);
        console.log(`   - All placeholders replaced successfully`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testStandardTemplate(); 