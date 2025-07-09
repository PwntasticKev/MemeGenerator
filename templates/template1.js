import fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';
import canvas from 'canvas';

// Helper to escape XML for SVG text
function escapeXml(unsafe) {
	if (!unsafe) return '';
	return unsafe.replace(/[<>&'"\n\r]/g, function (c) {
		switch (c) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case '\'': return '&apos;';
			case '"': return '&quot;';
			case '\n': return '<br/>';
			case '\r': return '';
		}
	}).replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control chars
}

// Helper to check if an image is a default/error image (gray background)
async function isDefaultImage(imageBuffer) {
	try {
		const metadata = await sharp(imageBuffer).metadata();
		const { width, height } = metadata;
		
		// Sample pixels to check if it's a solid gray color
		const sampleSize = Math.min(10, Math.floor(width / 4), Math.floor(height / 4));
		const sample = await sharp(imageBuffer)
			.resize(sampleSize, sampleSize, { fit: 'cover' })
			.raw()
			.toBuffer();
		
		// Check if all pixels are approximately the same gray color (#ccc = 204,204,204)
		const tolerance = 20;
		for (let i = 0; i < sample.length; i += 3) {
			const r = sample[i];
			const g = sample[i + 1];
			const b = sample[i + 2];
			
			// Check if pixel is not approximately gray
			if (Math.abs(r - g) > tolerance || Math.abs(g - b) > tolerance || Math.abs(r - b) > tolerance) {
				return false;
			}
			
			// Check if pixel is not approximately the default gray color (204,204,204)
			if (Math.abs(r - 204) > tolerance || Math.abs(g - 204) > tolerance || Math.abs(b - 204) > tolerance) {
				return false;
			}
		}
		return true;
	} catch (e) {
		return true; // Assume it's a default image if we can't analyze it
	}
}

// Helper to wrap text for SVG <text> elements
function wrapSvgText(text, maxWidth, fontSize, x, startY, lineHeight, maxHeightPx) {
	let minFontSize = 22;
	let margin = 32;
	let lines = [];
	let finalFontSize = fontSize;
	let fits = false;
	let attempt = 0;
	while (!fits && finalFontSize >= minFontSize) {
		const ctx = canvas.createCanvas(1,1).getContext('2d');
		ctx.font = `${finalFontSize}px Arial`;
		const words = text.split(' ');
		lines = [];
		let current = '';
		for (let word of words) {
			let test = current ? current + ' ' + word : word;
			let width = ctx.measureText(test).width;
			if (width > maxWidth - margin * 2 && current) {
				lines.push(current);
				current = word;
			} else {
				current = test;
			}
		}
		if (current) lines.push(current);
		const totalHeight = lines.length * lineHeight;
		if (totalHeight <= maxHeightPx && lines.every(line => ctx.measureText(line).width <= maxWidth - margin * 2)) {
			fits = true;
		} else {
			finalFontSize -= 2;
		}
		attempt++;
	}
	// If still doesn't fit, truncate last line with ellipsis
	const ctx = canvas.createCanvas(1,1).getContext('2d');
	ctx.font = `${finalFontSize}px Arial`;
	const maxLines = Math.floor(maxHeightPx / lineHeight);
	if (lines.length > maxLines) {
		lines = lines.slice(0, maxLines);
		let last = lines[maxLines-1];
		while (ctx.measureText(last + '...').width > maxWidth - margin * 2 && last.length > 0) {
			last = last.slice(0, -1);
		}
		lines[maxLines-1] = last + '...';
	}
	return {
		fontSize: finalFontSize,
		lines: lines.map((line, i) => `<tspan x="${x}" y="${startY + i*lineHeight}">${escapeXml(line)}</tspan>`).join('')
	};
}

export async function template1({ overlayPath, image1, image2, fact, reply, outputPath, debugSvgPath, avatarPath = './assets/mainoverlay_1.png', handle = '@memecreator', name = 'Meme Creator' }) {
	const OUTPUT_WIDTH = 1080;
	const OUTPUT_HEIGHT = 1920;
	const cardWidth = 1000;
	const padding = 28;
	const margin = 32;
	const imageHeight = 400;
	const imageX = (OUTPUT_WIDTH - cardWidth) / 2 + padding;
	const imageWidth = cardWidth - 2 * padding;
	const lineWidth = 6;
	const singleImageWidth = Math.floor((imageWidth - lineWidth) / 2);
	const fullImageWidth = imageWidth; // Full width for single image
	const profilePicSize = 80;
	const defaultFactFontSize = 48;
	const defaultReplyFontSize = 40;
	const factLineHeight = 54;
	const replyLineHeight = 46;
	const maxWidth = imageWidth;
	const factTextX = imageX + margin;
	const replyTextX = imageX + margin;
	const maxFactHeight = 420;
	const maxReplyHeight = 260;

	const cardY = OUTPUT_HEIGHT * 0.07;
	const factY = cardY + padding + 60;

	const factWrap = wrapSvgText(fact, maxWidth, defaultFactFontSize, factTextX, factY, factLineHeight, maxFactHeight);
	const factFontSize = factWrap.fontSize;
	const factLines = factWrap.lines.split('<tspan').length - 1;

	const imageY = factY + factLines * factLineHeight + 16;
	const replySectionY = imageY + imageHeight + 32;
	const nameX = imageX + profilePicSize + 32;
	const nameY = replySectionY + 40;
	const handleY = nameY + 36;
	const replyTextY = handleY + 48;

	const replyWrap = wrapSvgText(reply, maxWidth, defaultReplyFontSize, replyTextX, replyTextY, replyLineHeight, maxReplyHeight);
	const replyFontSize = replyWrap.fontSize;
	const replyLines = replyWrap.lines.split('<tspan').length - 1;

	const cardHeight = (factY - cardY) + factLines * factLineHeight + 16 + imageHeight + 32 + 36 + 36 + replyLines * replyLineHeight + 48 + padding;

	const composition = sharp(overlayPath).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT);
	const cardBackground = `
	<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
		<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
			<feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
		</filter>
		<rect x="${(OUTPUT_WIDTH - cardWidth) / 2}" y="${cardY}" width="${cardWidth}" height="${cardHeight}"
			fill="white" rx="56" ry="56" filter="url(#shadow)"/>
	</svg>`;

	// Fetch and process left image (URL or local file)
	let leftImage = null;
	let leftImageValid = false;
	try {
		if (image1.startsWith('http')) {
			// Fetch from URL
			const leftResponse = await axios.get(image1, { responseType: 'arraybuffer' });
			leftImage = await sharp(leftResponse.data)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.png()
				.toBuffer();
		} else {
			// Use local file
			leftImage = await sharp(image1)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.png()
				.toBuffer();
		}
		// Check if it's not a default image
		leftImageValid = !(await isDefaultImage(leftImage));
	} catch (e) {
		console.log('Left image failed to load:', e.message);
		leftImage = null;
		leftImageValid = false;
	}

	// Fetch and process right image (URL or local file)
	let rightImage = null;
	let rightImageValid = false;
	try {
		if (image2.startsWith('http')) {
			const rightResponse = await axios.get(image2, { responseType: 'arraybuffer' });
			rightImage = await sharp(rightResponse.data)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.png()
				.toBuffer();
		} else {
			rightImage = await sharp(image2)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.png()
				.toBuffer();
		}
		// Check if it's not a default image
		rightImageValid = !(await isDefaultImage(rightImage));
	} catch (e) {
		console.log('Right image failed to load:', e.message);
		rightImage = null;
		rightImageValid = false;
	}

	// Determine layout based on which images are valid
	let layout = 'none';
	let finalLeftImage = null;
	let finalRightImage = null;
	let imageCompositions = [];

	if (leftImageValid && rightImageValid) {
		// Both images valid - use split layout
		layout = 'split';
		const leftMaskSvg = `<svg width='${singleImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${singleImageWidth}' height='${imageHeight}' rx='56' ry='56' style='fill:white'/><rect x='${singleImageWidth/2}' y='0' width='${singleImageWidth/2}' height='${imageHeight}' style='fill:white'/></svg>`;
		const rightMaskSvg = `<svg width='${singleImageWidth}' height='${imageHeight}'>
			<path
				d="M0,0
					H${singleImageWidth - 56}
					Q${singleImageWidth},0 ${singleImageWidth},56
					V${imageHeight - 56}
					Q${singleImageWidth},${imageHeight} ${singleImageWidth - 56},${imageHeight}
					H0
					Z"
				fill="white"/>
		</svg>`;
		
		finalLeftImage = await sharp(leftImage)
			.composite([{ input: Buffer.from(leftMaskSvg), blend: 'dest-in' }])
			.png()
			.toBuffer();
		finalRightImage = await sharp(rightImage)
			.composite([{ input: Buffer.from(rightMaskSvg), blend: 'dest-in' }])
			.png()
			.toBuffer();
		
		imageCompositions = [
			{ input: finalLeftImage, top: Math.round(imageY), left: Math.round(imageX) },
			{ input: finalRightImage, top: Math.round(imageY), left: Math.round(imageX + singleImageWidth + lineWidth) }
		];
	} else if (leftImageValid) {
		// Only left image valid - use full width
		layout = 'single';
		const fullMaskSvg = `<svg width='${fullImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${fullImageWidth}' height='${imageHeight}' rx='56' ry='56' style='fill:white'/></svg>`;
		
		finalLeftImage = await sharp(leftImage)
			.resize(fullImageWidth, imageHeight, { fit: 'cover', position: 'center' })
			.composite([{ input: Buffer.from(fullMaskSvg), blend: 'dest-in' }])
			.png()
			.toBuffer();
		
		imageCompositions = [
			{ input: finalLeftImage, top: Math.round(imageY), left: Math.round(imageX) }
		];
	} else if (rightImageValid) {
		// Only right image valid - use full width
		layout = 'single';
		const fullMaskSvg = `<svg width='${fullImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${fullImageWidth}' height='${imageHeight}' rx='56' ry='56' style='fill:white'/></svg>`;
		
		finalRightImage = await sharp(rightImage)
			.resize(fullImageWidth, imageHeight, { fit: 'cover', position: 'center' })
			.composite([{ input: Buffer.from(fullMaskSvg), blend: 'dest-in' }])
			.png()
			.toBuffer();
		
		imageCompositions = [
			{ input: finalRightImage, top: Math.round(imageY), left: Math.round(imageX) }
		];
	} else {
		// No valid images - create placeholder
		layout = 'none';
		const placeholderSvg = `<svg width='${fullImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${fullImageWidth}' height='${imageHeight}' rx='56' ry='56' fill='#f0f0f0'/><text x='50%' y='50%' text-anchor='middle' dy='0.35em' font-family='Arial' font-size='24' fill='#999'>No images available</text></svg>`;
		
		imageCompositions = [
			{ input: Buffer.from(placeholderSvg), top: Math.round(imageY), left: Math.round(imageX) }
		];
	}

	// Generate SVG based on layout
	let imageSvg = '';
	if (layout === 'split') {
		imageSvg = `
		<g>
			<image x="${imageX}" y="${imageY}" width="${singleImageWidth}" height="${imageHeight}" href="leftImage.png"/>
			<image x="${imageX + singleImageWidth + lineWidth}" y="${imageY}" width="${singleImageWidth}" height="${imageHeight}" href="rightImage.png"/>
		</g>`;
	} else if (layout === 'single') {
		imageSvg = `
		<g>
			<image x="${imageX}" y="${imageY}" width="${fullImageWidth}" height="${imageHeight}" href="singleImage.png"/>
		</g>`;
	} else {
		imageSvg = `
		<g>
			<image x="${imageX}" y="${imageY}" width="${fullImageWidth}" height="${imageHeight}" href="placeholder.png"/>
		</g>`;
	}

	// Compose the card SVG, now including avatar, handle, and name
	const cardSvg = `
	<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
		<rect x="0" y="0" width="100%" height="100%" fill="none"/>
		<g>
			${cardBackground}
		</g>
		<g>
			<text x="${factTextX}" y="${factY}" font-size="${factFontSize}" font-family="Arial" fill="#222" font-weight="bold">
				${factWrap.lines}
			</text>
		</g>
		${imageSvg}
		<!-- Avatar and handle section -->
		<g>
			<circle cx="${imageX + profilePicSize/2}" cy="${replySectionY + profilePicSize/2}" r="${profilePicSize/2}" fill="white" stroke="#ddd" stroke-width="3"/>
			<image x="${imageX}" y="${replySectionY}" width="${profilePicSize}" height="${profilePicSize}" href="${avatarPath}"/>
			<text x="${nameX}" y="${nameY}" font-size="32" font-family="Arial" fill="#222" font-weight="bold">${escapeXml(name)}</text>
			<text x="${nameX}" y="${handleY}" font-size="28" font-family="Arial" fill="#888">${escapeXml(handle)}</text>
		</g>
		<g>
			<text x="${replyTextX}" y="${replyTextY}" font-size="${replyFontSize}" font-family="Arial" fill="#444">
				${replyWrap.lines}
			</text>
		</g>
	</svg>`;

	// Save debug SVG
	if (debugSvgPath) {
		fs.writeFileSync(debugSvgPath, cardSvg);
	}

	// Compose the final image
	await composition
		.composite([
			{ input: Buffer.from(cardSvg), top: 0, left: 0 },
			...imageCompositions
		])
		.png()
		.toFile(outputPath);
} 