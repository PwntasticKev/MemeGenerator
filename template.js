import fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';
import canvas from 'canvas';

// Helper to wrap text for Canvas
function wrapCanvasText(ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px Arial`;
  const words = text.split(' ');
  let lines = [];
  let current = '';
  for (let word of words) {
    let test = current ? current + ' ' + word : word;
    let width = ctx.measureText(test).width;
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Helper to draw rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function generateTemplate({ overlayPath, image1, image2, fact, reply, outputPath, avatarPath = './assets/mainoverlay_1.png', handle = '@memecreator', name = 'Meme Creator' }) {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const CARD_WIDTH = 1000;
  const CARD_X = (WIDTH - CARD_WIDTH) / 2;
  const CARD_Y = 120;
  
  // Layout positions
  const FACT_Y = CARD_Y + 60;
  const IMAGE_WIDTH = 400;
  const IMAGE_HEIGHT = 300;
  const IMAGE_Y = FACT_Y + 120; // After fact text
  const LEFT_IMAGE_X = CARD_X + 60;
  const RIGHT_IMAGE_X = CARD_X + CARD_WIDTH - IMAGE_WIDTH - 60;
  
  const AVATAR_SIZE = 80;
  const AVATAR_X = CARD_X + 60;
  const AVATAR_Y = IMAGE_Y + IMAGE_HEIGHT + 60; // After images
  const NAME_X = AVATAR_X + AVATAR_SIZE + 24;
  const NAME_Y = AVATAR_Y + 16; // Better vertical alignment with avatar
  const HANDLE_Y = NAME_Y + 32; // Closer spacing for better alignment
  
  const REPLY_Y = AVATAR_Y + AVATAR_SIZE + 40; // After avatar section

  // Create base canvas
  const cnv = canvas.createCanvas(WIDTH, HEIGHT);
  const ctx = cnv.getContext('2d');

  // Draw overlay background
  const overlayImg = await canvas.loadImage(overlayPath);
  ctx.drawImage(overlayImg, 0, 0, WIDTH, HEIGHT);

  // Calculate content height to make card dynamic
  ctx.font = 'bold 48px Arial';
  const factLines = wrapCanvasText(ctx, fact, CARD_WIDTH - 120, 48);
  const factHeight = factLines.length * 56;
  
  ctx.font = '40px Arial';
  const replyLines = wrapCanvasText(ctx, reply, CARD_WIDTH - 120, 40);
  const replyHeight = replyLines.length * 48;
  
  // Calculate total content height
  const contentHeight = 60 + factHeight + 60 + IMAGE_HEIGHT + 60 + AVATAR_SIZE + 40 + replyHeight + 60;
  const CARD_HEIGHT = contentHeight;

  // Draw card with dynamic height
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'white';
  drawRoundedRect(ctx, CARD_X, CARD_Y, CARD_WIDTH, CARD_HEIGHT, 56);
  ctx.fill();
  ctx.restore();

  // Draw fact text first (at the top)
  ctx.fillStyle = '#222';
  ctx.font = 'bold 48px Arial';
  ctx.textBaseline = 'top';
  let factY = FACT_Y;
  for (let line of factLines) {
    ctx.fillText(line, CARD_X + 60, factY);
    factY += 56;
  }

  // Helper function to create fallback image
  const createFallbackImage = (x, y, width, height, text, isLeft = true) => {
    // Create gradient background
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
    const color1 = colors[Math.floor(Math.random() * colors.length)];
    const color2 = colors[Math.floor(Math.random() * colors.length)];
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    
    // Draw rounded rectangle with gradient
    ctx.save();
    ctx.fillStyle = gradient;
    if (isLeft) {
      // Left image: round left corners
      ctx.beginPath();
      ctx.moveTo(x + 20, y);
      ctx.lineTo(x + width - 20, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + 20);
      ctx.lineTo(x + width, y + height - 20);
      ctx.quadraticCurveTo(x + width, y + height, x + width - 20, y + height);
      ctx.lineTo(x + 20, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - 20);
      ctx.lineTo(x, y + 20);
      ctx.quadraticCurveTo(x, y, x + 20, y);
    } else {
      // Right image: round right corners
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width - 20, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + 20);
      ctx.lineTo(x + width, y + height - 20);
      ctx.quadraticCurveTo(x + width, y + height, x + width - 20, y + height);
      ctx.lineTo(x, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - 20);
      ctx.lineTo(x, y + 20);
      ctx.quadraticCurveTo(x, y, x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Add text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Image', x + width/2, y + height/2 - 15);
    ctx.fillText('Not Found', x + width/2, y + height/2 + 15);
    ctx.restore();
  };

  // Draw images with correct rounded corners and fallbacks - GUARANTEED to always show 2 images
  if (image1 && image1.trim()) {
    try {
      let imgBuf;
      if (image1.startsWith('http')) {
        const resp = await axios.get(image1, { 
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        imgBuf = resp.data;
        
        // Convert WebP to PNG if needed for better canvas compatibility
        try {
          const sharp = await import('sharp');
          imgBuf = await sharp.default(imgBuf).png().toBuffer();
        } catch (sharpError) {
          console.log('Sharp conversion failed, using original image:', sharpError.message);
        }
      } else {
        imgBuf = fs.readFileSync(image1);
      }
      const img = await canvas.loadImage(imgBuf);
      
      // Draw left image with rounded corners (top-left and bottom-left corners rounded)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(LEFT_IMAGE_X + 20, IMAGE_Y);
      ctx.lineTo(LEFT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y);
      ctx.quadraticCurveTo(LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y, LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + 20);
      ctx.lineTo(LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT - 20);
      ctx.quadraticCurveTo(LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT, LEFT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y + IMAGE_HEIGHT);
      ctx.lineTo(LEFT_IMAGE_X + 20, IMAGE_Y + IMAGE_HEIGHT);
      ctx.quadraticCurveTo(LEFT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT, LEFT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT - 20);
      ctx.lineTo(LEFT_IMAGE_X, IMAGE_Y + 20);
      ctx.quadraticCurveTo(LEFT_IMAGE_X, IMAGE_Y, LEFT_IMAGE_X + 20, IMAGE_Y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT);
      ctx.restore();
      console.log('✅ Left image loaded successfully');
    } catch (e) {
      console.log('Left image failed, using fallback:', e.message);
      createFallbackImage(LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 1', true);
    }
  } else {
    console.log('Left image URL is empty, using fallback');
    createFallbackImage(LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 1', true);
  }
  
  if (image2 && image2.trim()) {
    try {
      let imgBuf;
      if (image2.startsWith('http')) {
        const resp = await axios.get(image2, { 
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        imgBuf = resp.data;
        
        // Convert WebP to PNG if needed for better canvas compatibility
        try {
          const sharp = await import('sharp');
          imgBuf = await sharp.default(imgBuf).png().toBuffer();
        } catch (sharpError) {
          console.log('Sharp conversion failed, using original image:', sharpError.message);
        }
      } else {
        imgBuf = fs.readFileSync(image2);
      }
      const img = await canvas.loadImage(imgBuf);
      
      // Draw right image with rounded corners (top-right and bottom-right corners rounded)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(RIGHT_IMAGE_X, IMAGE_Y);
      ctx.lineTo(RIGHT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y);
      ctx.quadraticCurveTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y, RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + 20);
      ctx.lineTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT - 20);
      ctx.quadraticCurveTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT, RIGHT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y + IMAGE_HEIGHT);
      ctx.lineTo(RIGHT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT);
      ctx.quadraticCurveTo(RIGHT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT, RIGHT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT - 20);
      ctx.lineTo(RIGHT_IMAGE_X, IMAGE_Y + 20);
      ctx.quadraticCurveTo(RIGHT_IMAGE_X, IMAGE_Y, RIGHT_IMAGE_X, IMAGE_Y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT);
      ctx.restore();
      console.log('✅ Right image loaded successfully');
    } catch (e) {
      console.log('Right image failed, using fallback:', e.message);
      createFallbackImage(RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 2', false);
    }
  } else {
    console.log('Right image URL is empty, using fallback');
    createFallbackImage(RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 2', false);
  }

  // Draw avatar
  try {
    let avatarBuf;
    if (avatarPath && avatarPath.startsWith('http')) {
      const resp = await axios.get(avatarPath, { responseType: 'arraybuffer' });
      avatarBuf = resp.data;
    } else {
      avatarBuf = fs.readFileSync(avatarPath);
    }
    const avatarImg = await canvas.loadImage(avatarBuf);
    ctx.save();
    ctx.beginPath();
    ctx.arc(AVATAR_X + AVATAR_SIZE/2, AVATAR_Y + AVATAR_SIZE/2, AVATAR_SIZE/2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();
  } catch (e) {
    // fallback: blank circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(AVATAR_X + AVATAR_SIZE/2, AVATAR_Y + AVATAR_SIZE/2, AVATAR_SIZE/2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#eee';
    ctx.fill();
    ctx.restore();
  }

  // Draw name and handle (better aligned with avatar)
  ctx.fillStyle = '#222';
  ctx.font = 'bold 32px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, NAME_X, AVATAR_Y + AVATAR_SIZE/2 - 8);
  ctx.fillStyle = '#888';
  ctx.font = '28px Arial';
  ctx.fillText(handle, NAME_X, AVATAR_Y + AVATAR_SIZE/2 + 16);

  // Draw reply text (at the bottom)
  ctx.fillStyle = '#444';
  ctx.font = '40px Arial';
  let replyY = REPLY_Y;
  for (let line of replyLines) {
    ctx.fillText(line, CARD_X + 60, replyY);
    replyY += 48;
  }

  // Save output
  const out = fs.createWriteStream(outputPath);
  const stream = cnv.createPNGStream();
  stream.pipe(out);
  await new Promise(resolve => out.on('finish', resolve));
  console.log('✅ Template generation completed successfully!');
} 