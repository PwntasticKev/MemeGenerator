#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use jsdom for DOM parsing
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

// Template Management System
class TemplateManager {
	constructor() {
		this.templatesDir = path.join(__dirname, '..', 'templates');
		this.outputDir = path.join(__dirname, '..', 'templates', 'optimized');
		
		// Ensure output directory exists
		if (!fs.existsSync(this.outputDir)) {
			fs.mkdirSync(this.outputDir, { recursive: true });
		}
	}

	// Optimize all templates in the templates directory
	async optimizeAllTemplates() {
		console.log('🔧 Starting template optimization process...');
		
		try {
			const files = fs.readdirSync(this.templatesDir);
			const svgFiles = files.filter(file => file.endsWith('.svg') && !file.startsWith('optimized_'));
			
			console.log(`Found ${svgFiles.length} templates to optimize:`);
			svgFiles.forEach(file => console.log(`  - ${file}`));
			
			const results = [];
			
			for (const file of svgFiles) {
				const templatePath = path.join(this.templatesDir, file);
				const result = await this.optimizeTemplate(templatePath);
				results.push(result);
			}
			
			// Generate summary report
			this.generateOptimizationReport(results);
			
			console.log('✅ Template optimization completed!');
			return results;
			
		} catch (error) {
			console.error('❌ Template optimization failed:', error);
			throw error;
		}
	}

	// Optimize a single template
	async optimizeTemplate(templatePath) {
		const templateName = path.basename(templatePath);
		console.log(`\n🔧 Optimizing ${templateName}...`);
		
		try {
			// Load template
			const svgContent = fs.readFileSync(templatePath, 'utf8');
			const templateNum = this.extractTemplateNumber(templateName);
			
			// Parse SVG
			const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
			const doc = dom.window.document;
			
			// Check if already optimized
			const isOptimized = doc.querySelector('svg').getAttribute('data-optimized') === 'true';
			if (isOptimized) {
				console.log(`  ⚠️  ${templateName} is already optimized`);
				return { templateName, status: 'already_optimized', errors: [], warnings: [] };
			}
			
			// Optimize template
			const optimizedSvg = this.performOptimization(doc, templateNum);
			
			// Validate optimized template
			const validation = this.validateOptimizedTemplate(optimizedSvg, templateNum);
			
			// Save optimized template
			const outputPath = path.join(this.outputDir, `optimized_${templateName}`);
			fs.writeFileSync(outputPath, optimizedSvg);
			
			// Also update the original template
			const backupPath = path.join(this.templatesDir, `${templateName}.backup`);
			fs.writeFileSync(backupPath, svgContent); // Backup original
			fs.writeFileSync(templatePath, optimizedSvg); // Update original
			
			console.log(`  ✅ ${templateName} optimized successfully`);
			console.log(`     - Backup saved: ${path.basename(backupPath)}`);
			console.log(`     - Optimized copy: ${path.basename(outputPath)}`);
			
			return {
				templateName,
				status: 'optimized',
				validation,
				outputPath,
				backupPath
			};
			
		} catch (error) {
			console.error(`  ❌ Failed to optimize ${templateName}:`, error.message);
			return {
				templateName,
				status: 'failed',
				error: error.message
			};
		}
	}

	// Perform the actual optimization
	performOptimization(doc, templateNum) {
		console.log(`  🔍 Analyzing template structure...`);
		
		// Add template metadata
		this.addTemplateMetadata(doc, templateNum);
		
		// Optimize containers
		this.optimizeContainers(doc);
		
		// Optimize text elements
		this.optimizeTextElements(doc);
		
		// Optimize image placeholders
		this.optimizeImagePlaceholders(doc);
		
		// Optimize avatar placeholder
		this.optimizeAvatarPlaceholder(doc);
		
		// Add CSS classes for styling
		this.addCSSClasses(doc);
		
		// Add comments for clarity
		this.addHelpfulComments(doc);
		
		// Serialize back to string
		return doc.documentElement.outerHTML;
	}

	// Add template metadata
	addTemplateMetadata(doc, templateNum) {
		const svg = doc.querySelector('svg');
		if (svg) {
			svg.setAttribute('data-template', templateNum);
			svg.setAttribute('data-optimized', 'true');
			svg.setAttribute('data-version', '1.0');
			svg.setAttribute('data-created', new Date().toISOString());
			
			// Add metadata element
			const metadata = doc.createElement('metadata');
			metadata.appendChild(doc.createTextNode(`
				Template ${templateNum} - Optimized for Dynamic Content
				- Text placeholders: {fact_here}, {reply_here}, {username_here}, {handle_here}
				- Image slots: Automatically detected
				- Avatar slot: Circular placeholder
				- Dynamic sizing: Enabled
				- Created: ${new Date().toISOString()}
			`));
			svg.insertBefore(metadata, svg.firstChild);
		}
	}

	// Optimize container elements
	optimizeContainers(doc) {
		console.log(`    📦 Optimizing containers...`);
		
		// Background container
		const background = doc.querySelector('rect[fill="#878787"]');
		if (background) {
			background.setAttribute('id', 'background');
			background.setAttribute('class', 'background-container');
			background.setAttribute('data-role', 'background');
			this.addComment(doc, background, 'Background - will be replaced with account overlay');
		}

		// White containers (text containers)
		const whiteContainers = Array.from(doc.querySelectorAll('rect[fill="white"]'));
		whiteContainers.forEach((container, index) => {
			const y = parseInt(container.getAttribute('y') || '0');
			const id = y < 500 ? 'top-container' : 'bottom-container';
			const role = y < 500 ? 'fact-container' : 'reply-container';
			
			container.setAttribute('id', id);
			container.setAttribute('class', `text-container ${role}`);
			container.setAttribute('data-role', role);
			container.setAttribute('data-dynamic-height', 'true');
			
			const comment = y < 500 ? 'Top container - fact text (dynamic height)' : 'Bottom container - reply text (dynamic height)';
			this.addComment(doc, container, comment);
		});
		
		console.log(`      ✅ Optimized ${whiteContainers.length + 1} containers`);
	}

	// Optimize text elements
	optimizeTextElements(doc) {
		console.log(`    📝 Optimizing text elements...`);
		
		const textElements = Array.from(doc.querySelectorAll('text'));
		let optimized = 0;
		
		textElements.forEach(text => {
			const content = text.textContent.trim();
			
			// Identify and optimize based on placeholder
			if (content.includes('{fact_here}')) {
				this.optimizeTextElement(text, 'fact-text', 'fact_here', 'top-container');
				this.addComment(doc, text, 'Fact text - dynamically resized');
				optimized++;
			} else if (content.includes('{reply_here}')) {
				this.optimizeTextElement(text, 'reply-text', 'reply_here', 'bottom-container');
				this.addComment(doc, text, 'Reply text - dynamically resized');
				optimized++;
			} else if (content.includes('{username_here}')) {
				this.optimizeTextElement(text, 'username-text', 'username_here', 'bottom-container');
				this.addComment(doc, text, 'Username text');
				optimized++;
			} else if (content.includes('{handle_here}')) {
				this.optimizeTextElement(text, 'handle-text', 'handle_here', 'bottom-container');
				this.addComment(doc, text, 'Handle text');
				optimized++;
			}
		});
		
		console.log(`      ✅ Optimized ${optimized} text elements`);
	}

	// Optimize individual text element
	optimizeTextElement(element, className, placeholder, container) {
		const id = className.replace('-text', '');
		element.setAttribute('id', id);
		element.setAttribute('class', `${className} dynamic-text`);
		element.setAttribute('data-placeholder', placeholder);
		element.setAttribute('data-container', container);
		element.setAttribute('data-dynamic-size', 'true');
	}

	// Optimize image placeholders
	optimizeImagePlaceholders(doc) {
		console.log(`    🖼️  Optimizing image placeholders...`);
		
		const imageRects = Array.from(doc.querySelectorAll('rect[fill="#CACACA"]'));
		
		imageRects.forEach((rect, index) => {
			const id = `image${index + 1}`;
			rect.setAttribute('id', id);
			rect.setAttribute('class', 'image-placeholder');
			rect.setAttribute('data-role', 'image');
			rect.setAttribute('data-slot', index + 1);
			rect.setAttribute('data-dynamic-position', 'true');
			
			this.addComment(doc, rect, `Image ${index + 1} placeholder - will be replaced with actual image`);
		});
		
		console.log(`      ✅ Optimized ${imageRects.length} image placeholders`);
	}

	// Optimize avatar placeholder
	optimizeAvatarPlaceholder(doc) {
		console.log(`    👤 Optimizing avatar placeholder...`);
		
		const avatarCircle = doc.querySelector('circle[fill="#D1CBCB"]');
		if (avatarCircle) {
			avatarCircle.setAttribute('id', 'avatar');
			avatarCircle.setAttribute('class', 'avatar-placeholder');
			avatarCircle.setAttribute('data-role', 'avatar');
			avatarCircle.setAttribute('data-container', 'bottom-container');
			
			this.addComment(doc, avatarCircle, 'Avatar placeholder - will be replaced with account avatar');
			console.log(`      ✅ Optimized avatar placeholder`);
		} else {
			console.log(`      ⚠️  No avatar placeholder found`);
		}
	}

	// Add CSS classes for styling
	addCSSClasses(doc) {
		console.log(`    🎨 Adding CSS classes...`);
		
		const svg = doc.querySelector('svg');
		if (svg) {
			const style = doc.createElement('style');
			style.setAttribute('type', 'text/css');
			style.appendChild(doc.createTextNode(`
				/* Dynamic Template Styles */
				.dynamic-text {
					font-family: Arial, sans-serif;
				}
				.fact-text {
					font-weight: bold;
					font-size: 28px;
					text-anchor: middle;
					dominant-baseline: hanging;
				}
				.reply-text {
					font-weight: normal;
					font-size: 22px;
					text-anchor: start;
					dominant-baseline: hanging;
				}
				.username-text {
					font-weight: bold;
					font-size: 18px;
					text-anchor: start;
					dominant-baseline: hanging;
				}
				.handle-text {
					font-weight: normal;
					font-size: 16px;
					text-anchor: start;
					dominant-baseline: hanging;
					fill: gray;
				}
				.text-container {
					rx: 15;
				}
				.image-placeholder {
					rx: 15;
				}
				.avatar-placeholder {
					/* Avatar styles */
				}
				.background-container {
					/* Background styles */
				}
			`));
			
			// Insert after metadata
			const metadata = svg.querySelector('metadata');
			if (metadata) {
				svg.insertBefore(style, metadata.nextSibling);
			} else {
				svg.insertBefore(style, svg.firstChild);
			}
			
			console.log(`      ✅ Added CSS classes`);
		}
	}

	// Add helpful comments
	addHelpfulComments(doc) {
		const svg = doc.querySelector('svg');
		if (svg) {
			// Add header comment
			const headerComment = doc.createComment(`
				DYNAMIC TEMPLATE - OPTIMIZED FOR AUTOMATIC SCALING
				
				This template has been optimized for dynamic content generation.
				
				Key Features:
				- Text containers automatically resize based on content
				- Images are positioned dynamically
				- All elements have proper IDs and classes
				- Supports account-specific overlays
				
				Text Placeholders:
				- {fact_here} - Main fact text (top container)
				- {reply_here} - Reply text (bottom container)
				- {username_here} - Username (bottom container)
				- {handle_here} - Handle (bottom container)
				
				Image Placeholders:
				- Rectangles with fill="#CACACA" will be replaced with images
				
				Avatar Placeholder:
				- Circle with fill="#D1CBCB" will be replaced with avatar
				
				Background:
				- Rectangle with fill="#878787" will be replaced with account overlay
			`);
			svg.insertBefore(headerComment, svg.firstChild);
		}
	}

	// Add comment before element
	addComment(doc, element, text) {
		const comment = doc.createComment(` ${text} `);
		element.parentNode.insertBefore(comment, element);
	}

	// Validate optimized template
	validateOptimizedTemplate(svgContent, templateNum) {
		console.log(`    ✅ Validating optimized template...`);
		
		const validation = {
			isValid: true,
			errors: [],
			warnings: [],
			elements: {
				textPlaceholders: 0,
				imageSlots: 0,
				avatarSlot: 0,
				containers: 0,
				hasMetadata: false,
				hasStyles: false
			}
		};

		try {
			const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
			const doc = dom.window.document;

			// Check for optimization markers
			const svg = doc.querySelector('svg');
			if (svg.getAttribute('data-optimized') !== 'true') {
				validation.errors.push('Template not marked as optimized');
				validation.isValid = false;
			}

			// Check for metadata
			const metadata = doc.querySelector('metadata');
			validation.elements.hasMetadata = !!metadata;
			if (!metadata) {
				validation.warnings.push('No metadata found');
			}

			// Check for styles
			const styles = doc.querySelector('style');
			validation.elements.hasStyles = !!styles;
			if (!styles) {
				validation.warnings.push('No CSS styles found');
			}

			// Check for required text placeholders
			const placeholders = ['{fact_here}', '{reply_here}', '{username_here}', '{handle_here}'];
			placeholders.forEach(placeholder => {
				if (svgContent.includes(placeholder)) {
					validation.elements.textPlaceholders++;
				} else {
					validation.warnings.push(`Missing text placeholder: ${placeholder}`);
				}
			});

			// Check for image slots
			const imageRects = doc.querySelectorAll('rect[fill="#CACACA"]');
			validation.elements.imageSlots = imageRects.length;
			if (imageRects.length === 0) {
				validation.warnings.push('No image slots found');
			}

			// Check for avatar slot
			const avatarCircle = doc.querySelector('circle[fill="#D1CBCB"]');
			validation.elements.avatarSlot = avatarCircle ? 1 : 0;
			if (!avatarCircle) {
				validation.warnings.push('No avatar slot found');
			}

			// Check for containers
			const containers = doc.querySelectorAll('rect[fill="white"]');
			validation.elements.containers = containers.length;
			if (containers.length === 0) {
				validation.errors.push('No text containers found');
				validation.isValid = false;
			}

			// Check for proper IDs
			const requiredIds = ['background', 'top-container', 'bottom-container'];
			requiredIds.forEach(id => {
				if (!doc.querySelector(`#${id}`)) {
					validation.warnings.push(`Missing required ID: ${id}`);
				}
			});

			console.log(`      📊 Validation results:`, validation.elements);
			
			return validation;

		} catch (error) {
			validation.isValid = false;
			validation.errors.push(`Validation error: ${error.message}`);
			return validation;
		}
	}

	// Generate optimization report
	generateOptimizationReport(results) {
		console.log('\n📊 OPTIMIZATION REPORT');
		console.log('========================');
		
		const successful = results.filter(r => r.status === 'optimized').length;
		const alreadyOptimized = results.filter(r => r.status === 'already_optimized').length;
		const failed = results.filter(r => r.status === 'failed').length;
		
		console.log(`Total templates: ${results.length}`);
		console.log(`✅ Successfully optimized: ${successful}`);
		console.log(`⚠️  Already optimized: ${alreadyOptimized}`);
		console.log(`❌ Failed: ${failed}`);
		
		if (failed > 0) {
			console.log('\n❌ Failed templates:');
			results.filter(r => r.status === 'failed').forEach(r => {
				console.log(`  - ${r.templateName}: ${r.error}`);
			});
		}
		
		// Save detailed report
		const reportPath = path.join(this.outputDir, 'optimization_report.json');
		fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
		console.log(`\n📄 Detailed report saved: ${reportPath}`);
	}

	// Generate preview for a template
	async generatePreview(templatePath, outputPath) {
		console.log(`🖼️  Generating preview for ${path.basename(templatePath)}...`);
		
		try {
			const svgContent = fs.readFileSync(templatePath, 'utf8');
			
			const dummyData = {
				fact_here: "This is a sample fact that demonstrates how the text will appear and wrap within the container when using real content",
				reply_here: "This is a sample reply that shows how the response text will be formatted and positioned within the bottom container area",
				username_here: "Sample User",
				handle_here: "@sampleuser"
			};

			let previewSvg = svgContent;
			
			// Replace placeholders with dummy data
			Object.entries(dummyData).forEach(([placeholder, value]) => {
				previewSvg = previewSvg.replace(new RegExp(`{${placeholder}}`, 'g'), value);
			});

			// Save preview
			fs.writeFileSync(outputPath, previewSvg);
			console.log(`✅ Preview saved: ${outputPath}`);
			
			return outputPath;
			
		} catch (error) {
			console.error(`❌ Failed to generate preview:`, error);
			throw error;
		}
	}

	// Helper methods
	extractTemplateNumber(filename) {
		const match = filename.match(/template(\d+)/);
		return match ? match[1] : 'unknown';
	}

	// Create a new template from scratch
	createNewTemplate(templateNum, options = {}) {
		console.log(`🆕 Creating new template${templateNum}...`);
		
		const {
			width = 1080,
			height = 1920,
			topContainerHeight = 325,
			bottomContainerHeight = 369,
			imageCount = 2
		} = options;

		const svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" data-template="${templateNum}" data-optimized="true" data-version="1.0">
<!-- DYNAMIC TEMPLATE - OPTIMIZED FOR AUTOMATIC SCALING -->
<metadata>
	Template ${templateNum} - Optimized for Dynamic Content
	- Text placeholders: {fact_here}, {reply_here}, {username_here}, {handle_here}
	- Image slots: ${imageCount}
	- Avatar slot: Circular placeholder
	- Dynamic sizing: Enabled
</metadata>

<style type="text/css">
	/* Dynamic Template Styles */
	.dynamic-text { font-family: Arial, sans-serif; }
	.fact-text { font-weight: bold; font-size: 28px; text-anchor: middle; dominant-baseline: hanging; }
	.reply-text { font-weight: normal; font-size: 22px; text-anchor: start; dominant-baseline: hanging; }
	.username-text { font-weight: bold; font-size: 18px; text-anchor: start; dominant-baseline: hanging; }
	.handle-text { font-weight: normal; font-size: 16px; text-anchor: start; dominant-baseline: hanging; fill: gray; }
	.text-container { rx: 15; }
	.image-placeholder { rx: 15; }
</style>

<!-- Background - will be replaced with account overlay -->
<rect id="background" class="background-container" data-role="background" width="${width}" height="${height}" fill="#878787"/>

<!-- Top container - fact text (dynamic height) -->
<rect id="top-container" class="text-container fact-container" data-role="fact-container" data-dynamic-height="true" x="103" y="104" width="879" height="${topContainerHeight}" fill="white"/>

<!-- Fact text - dynamically resized -->
<text id="fact-text" class="fact-text dynamic-text" data-placeholder="fact_here" data-container="top-container" data-dynamic-size="true" x="542.5" y="140" fill="black">{fact_here}</text>

${Array.from({length: imageCount}, (_, i) => {
	const x = i === 0 ? 97 : 543;
	const y = 467;
	return `<!-- Image ${i + 1} placeholder - will be replaced with actual image -->
<rect id="image${i + 1}" class="image-placeholder" data-role="image" data-slot="${i + 1}" data-dynamic-position="true" x="${x}" y="${y}" width="433" height="703" fill="#CACACA"/>`;
}).join('\n')}

<!-- Bottom container - reply text (dynamic height) -->
<rect id="bottom-container" class="text-container reply-container" data-role="reply-container" data-dynamic-height="true" x="97" y="1208" width="879" height="${bottomContainerHeight}" fill="white"/>

<!-- Username text -->
<text id="username-text" class="username-text dynamic-text" data-placeholder="username_here" data-container="bottom-container" x="220" y="1260" fill="black">{username_here}</text>

<!-- Handle text -->
<text id="handle-text" class="handle-text dynamic-text" data-placeholder="handle_here" data-container="bottom-container" x="220" y="1285" fill="gray">{handle_here}</text>

<!-- Reply text - dynamically resized -->
<text id="reply-text" class="reply-text dynamic-text" data-placeholder="reply_here" data-container="bottom-container" data-dynamic-size="true" x="220" y="1340" fill="black">{reply_here}</text>

<!-- Avatar placeholder - will be replaced with account avatar -->
<circle id="avatar" class="avatar-placeholder" data-role="avatar" data-container="bottom-container" cx="170" cy="1270" r="35" fill="#D1CBCB"/>

</svg>`;

		const templatePath = path.join(this.templatesDir, `template${templateNum}.svg`);
		fs.writeFileSync(templatePath, svgContent);
		
		console.log(`✅ New template created: ${templatePath}`);
		return templatePath;
	}
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
	const manager = new TemplateManager();
	const command = process.argv[2];
	
	switch (command) {
		case 'optimize':
			manager.optimizeAllTemplates().catch(console.error);
			break;
		case 'optimize-single':
			const templatePath = process.argv[3];
			if (!templatePath) {
				console.error('Usage: node templateManager.js optimize-single <template-path>');
				process.exit(1);
			}
			manager.optimizeTemplate(templatePath).catch(console.error);
			break;
		case 'create':
			const templateNum = process.argv[3];
			if (!templateNum) {
				console.error('Usage: node templateManager.js create <template-number>');
				process.exit(1);
			}
			manager.createNewTemplate(templateNum);
			break;
		case 'preview':
			const inputPath = process.argv[3];
			const outputPath = process.argv[4];
			if (!inputPath || !outputPath) {
				console.error('Usage: node templateManager.js preview <input-path> <output-path>');
				process.exit(1);
			}
			manager.generatePreview(inputPath, outputPath).catch(console.error);
			break;
		default:
			console.log(`
Template Manager - Dynamic SVG Template Optimization

Usage:
  node templateManager.js optimize              - Optimize all templates
  node templateManager.js optimize-single <path> - Optimize single template
  node templateManager.js create <number>       - Create new template
  node templateManager.js preview <input> <output> - Generate preview

Examples:
  node templateManager.js optimize
  node templateManager.js optimize-single templates/template2.svg
  node templateManager.js create 6
  node templateManager.js preview templates/template2.svg preview.svg
			`);
			break;
	}
}

export default TemplateManager; 