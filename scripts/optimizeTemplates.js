#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple Template Optimizer
class SimpleTemplateOptimizer {
	constructor() {
		this.templatesDir = path.join(__dirname, '..', 'templates');
	}

	// Optimize all templates
	async optimizeAllTemplates() {
		console.log('🔧 Optimizing all templates for dynamic content...');
		
		try {
			const files = fs.readdirSync(this.templatesDir);
			const svgFiles = files.filter(file => file.endsWith('.svg') && !file.includes('backup'));
			
			console.log(`Found ${svgFiles.length} templates to optimize:`);
			svgFiles.forEach(file => console.log(`  - ${file}`));
			
			for (const file of svgFiles) {
				const templatePath = path.join(this.templatesDir, file);
				await this.optimizeTemplate(templatePath);
			}
			
			console.log('✅ All templates optimized successfully!');
			
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
			let svgContent = fs.readFileSync(templatePath, 'utf8');
			const templateNum = this.extractTemplateNumber(templateName);
			
			// Check if already optimized
			if (svgContent.includes('data-optimized="true"')) {
				console.log(`  ⚠️  ${templateName} is already optimized`);
				return;
			}
			
			// Create backup
			const backupPath = templatePath + '.backup';
			if (!fs.existsSync(backupPath)) {
				fs.writeFileSync(backupPath, svgContent);
				console.log(`  💾 Backup created: ${path.basename(backupPath)}`);
			}
			
			// Optimize using string replacement
			svgContent = this.optimizeWithStringReplacement(svgContent, templateNum);
			
			// Write optimized template
			fs.writeFileSync(templatePath, svgContent);
			
			console.log(`  ✅ ${templateName} optimized successfully`);
			
		} catch (error) {
			console.error(`  ❌ Failed to optimize ${templateName}:`, error.message);
		}
	}

	// Optimize using string replacement
	optimizeWithStringReplacement(svgContent, templateNum) {
		console.log(`    🔍 Adding optimization attributes...`);
		
		// Add optimization markers to SVG element
		svgContent = svgContent.replace(
			/<svg([^>]*)>/,
			`<svg$1 data-template="${templateNum}" data-optimized="true" data-version="1.0">`
		);

		// Add metadata and styles
		const metadataAndStyles = `
<!-- DYNAMIC TEMPLATE - OPTIMIZED FOR AUTOMATIC SCALING -->
<metadata>
	Template ${templateNum} - Optimized for Dynamic Content
	- Text placeholders: {fact_here}, {reply_here}, {username_here}, {handle_here}
	- Image slots: Automatically detected
	- Avatar slot: Circular placeholder
	- Dynamic sizing: Enabled
	- Optimized: ${new Date().toISOString()}
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

`;

		// Insert metadata and styles after SVG opening tag
		svgContent = svgContent.replace(
			/(<svg[^>]*>)/,
			`$1${metadataAndStyles}`
		);

		// Optimize background rectangle
		svgContent = svgContent.replace(
			/<rect([^>]*fill="#878787"[^>]*)>/,
			`<!-- Background - will be replaced with account overlay -->
<rect id="background" class="background-container" data-role="background"$1>`
		);

		// Optimize white containers
		let containerIndex = 0;
		svgContent = svgContent.replace(
			/<rect([^>]*fill="white"[^>]*)>/g,
			(match, attrs) => {
				const isTopContainer = attrs.includes('y="104"') || attrs.includes('y="72"');
				const id = isTopContainer ? 'top-container' : 'bottom-container';
				const role = isTopContainer ? 'fact-container' : 'reply-container';
				const comment = isTopContainer ? 'Top container - fact text (dynamic height)' : 'Bottom container - reply text (dynamic height)';
				
				return `<!-- ${comment} -->
<rect id="${id}" class="text-container ${role}" data-role="${role}" data-dynamic-height="true"${attrs}>`;
			}
		);

		// Optimize image placeholders
		let imageIndex = 0;
		svgContent = svgContent.replace(
			/<rect([^>]*fill="#CACACA"[^>]*)>/g,
			(match, attrs) => {
				imageIndex++;
				return `<!-- Image ${imageIndex} placeholder - will be replaced with actual image -->
<rect id="image${imageIndex}" class="image-placeholder" data-role="image" data-slot="${imageIndex}" data-dynamic-position="true"${attrs}>`;
			}
		);

		// Optimize avatar placeholder
		svgContent = svgContent.replace(
			/<circle([^>]*fill="#D1CBCB"[^>]*)>/,
			`<!-- Avatar placeholder - will be replaced with account avatar -->
<circle id="avatar" class="avatar-placeholder" data-role="avatar" data-container="bottom-container"$1>`
		);

		// Optimize text elements
		svgContent = svgContent.replace(
			/<text([^>]*?)>([^<]*?){fact_here}([^<]*?)<\/text>/,
			`<!-- Fact text - dynamically resized -->
<text id="fact-text" class="fact-text dynamic-text" data-placeholder="fact_here" data-container="top-container" data-dynamic-size="true"$1>$2{fact_here}$3</text>`
		);

		svgContent = svgContent.replace(
			/<text([^>]*?)>([^<]*?){reply_here}([^<]*?)<\/text>/,
			`<!-- Reply text - dynamically resized -->
<text id="reply-text" class="reply-text dynamic-text" data-placeholder="reply_here" data-container="bottom-container" data-dynamic-size="true"$1>$2{reply_here}$3</text>`
		);

		svgContent = svgContent.replace(
			/<text([^>]*?)>([^<]*?){username_here}([^<]*?)<\/text>/,
			`<!-- Username text -->
<text id="username-text" class="username-text dynamic-text" data-placeholder="username_here" data-container="bottom-container"$1>$2{username_here}$3</text>`
		);

		svgContent = svgContent.replace(
			/<text([^>]*?)>([^<]*?){handle_here}([^<]*?)<\/text>/,
			`<!-- Handle text -->
<text id="handle-text" class="handle-text dynamic-text" data-placeholder="handle_here" data-container="bottom-container"$1>$2{handle_here}$3</text>`
		);

		console.log(`    ✅ Template optimized with IDs, classes, and metadata`);
		return svgContent;
	}

	// Extract template number from filename
	extractTemplateNumber(filename) {
		const match = filename.match(/template(\d+)/);
		return match ? match[1] : 'unknown';
	}

	// Validate template
	validateTemplate(templatePath) {
		console.log(`    📋 Validating ${path.basename(templatePath)}...`);
		
		try {
			const svgContent = fs.readFileSync(templatePath, 'utf8');
			
			const validation = {
				isOptimized: svgContent.includes('data-optimized="true"'),
				hasMetadata: svgContent.includes('<metadata>'),
				hasStyles: svgContent.includes('<style'),
				hasIds: {
					background: svgContent.includes('id="background"'),
					topContainer: svgContent.includes('id="top-container"'),
					bottomContainer: svgContent.includes('id="bottom-container"'),
					factText: svgContent.includes('id="fact-text"'),
					replyText: svgContent.includes('id="reply-text"'),
					usernameText: svgContent.includes('id="username-text"'),
					handleText: svgContent.includes('id="handle-text"'),
					avatar: svgContent.includes('id="avatar"')
				},
				placeholders: {
					fact: svgContent.includes('{fact_here}'),
					reply: svgContent.includes('{reply_here}'),
					username: svgContent.includes('{username_here}'),
					handle: svgContent.includes('{handle_here}')
				}
			};
			
			const issues = [];
			if (!validation.isOptimized) issues.push('Not optimized');
			if (!validation.hasMetadata) issues.push('Missing metadata');
			if (!validation.hasStyles) issues.push('Missing styles');
			
			Object.entries(validation.hasIds).forEach(([key, value]) => {
				if (!value) issues.push(`Missing ID: ${key}`);
			});
			
			Object.entries(validation.placeholders).forEach(([key, value]) => {
				if (!value) issues.push(`Missing placeholder: ${key}`);
			});
			
			if (issues.length === 0) {
				console.log(`      ✅ Template validation passed`);
			} else {
				console.log(`      ⚠️  Template validation issues:`, issues);
			}
			
			return validation;
			
		} catch (error) {
			console.error(`      ❌ Validation failed:`, error.message);
			return null;
		}
	}

	// Generate preview
	generatePreview(templatePath, outputPath) {
		console.log(`🖼️  Generating preview for ${path.basename(templatePath)}...`);
		
		try {
			let svgContent = fs.readFileSync(templatePath, 'utf8');
			
			// Replace placeholders with sample data
			const sampleData = {
				'{fact_here}': 'This is a sample fact that demonstrates how the text will appear and wrap within the container',
				'{reply_here}': 'This is a sample reply that shows how the response text will be formatted and positioned',
				'{username_here}': 'Sample User',
				'{handle_here}': '@sampleuser'
			};
			
			Object.entries(sampleData).forEach(([placeholder, value]) => {
				svgContent = svgContent.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
			});
			
			// Save preview
			fs.writeFileSync(outputPath, svgContent);
			console.log(`✅ Preview saved: ${outputPath}`);
			
		} catch (error) {
			console.error(`❌ Failed to generate preview:`, error.message);
		}
	}
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
	const optimizer = new SimpleTemplateOptimizer();
	const command = process.argv[2];
	
	switch (command) {
		case 'optimize':
			optimizer.optimizeAllTemplates().catch(console.error);
			break;
		case 'optimize-single':
			const templatePath = process.argv[3];
			if (!templatePath) {
				console.error('Usage: node optimizeTemplates.js optimize-single <template-path>');
				process.exit(1);
			}
			optimizer.optimizeTemplate(templatePath).catch(console.error);
			break;
		case 'validate':
			const validatePath = process.argv[3];
			if (!validatePath) {
				console.error('Usage: node optimizeTemplates.js validate <template-path>');
				process.exit(1);
			}
			optimizer.validateTemplate(validatePath);
			break;
		case 'preview':
			const inputPath = process.argv[3];
			const outputPath = process.argv[4];
			if (!inputPath || !outputPath) {
				console.error('Usage: node optimizeTemplates.js preview <input-path> <output-path>');
				process.exit(1);
			}
			optimizer.generatePreview(inputPath, outputPath);
			break;
		default:
			console.log(`
Template Optimizer - Make SVG Templates Dynamic

Usage:
  node optimizeTemplates.js optimize              - Optimize all templates
  node optimizeTemplates.js optimize-single <path> - Optimize single template
  node optimizeTemplates.js validate <path>       - Validate template
  node optimizeTemplates.js preview <input> <output> - Generate preview

Examples:
  node optimizeTemplates.js optimize
  node optimizeTemplates.js optimize-single templates/template2.svg
  node optimizeTemplates.js validate templates/template2.svg
  node optimizeTemplates.js preview templates/template2.svg preview.svg
			`);
			break;
	}
}

export default SimpleTemplateOptimizer; 