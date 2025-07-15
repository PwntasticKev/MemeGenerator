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

export async function template1({ overlayPath, image1, image2, fact, reply, outputPath, avatarPath = './assets/mainoverlay_1.png', handle = '@memecreator', name = 'Meme Creator' }) {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const CARD_WIDTH = 1000;
  const CARD_HEIGHT = 900;
  const CARD_X = (WIDTH - CARD_WIDTH) / 2;
  const CARD_Y = 120;
  const IMAGE_WIDTH = 400;
  const IMAGE_HEIGHT = 300;
  const IMAGE_Y = CARD_Y + 180;
  const LEFT_IMAGE_X = CARD_X + 60;
  const RIGHT_IMAGE_X = CARD_X + CARD_WIDTH - IMAGE_WIDTH - 60;
  const AVATAR_SIZE = 80;
  const AVATAR_X = CARD_X + 60;
  const AVATAR_Y = CARD_Y + CARD_HEIGHT - 120;
  const NAME_X = AVATAR_X + AVATAR_SIZE + 24;
  const NAME_Y = AVATAR_Y + 36;
  const HANDLE_Y = NAME_Y + 36;

  // Create base canvas
  const cnv = canvas.createCanvas(WIDTH, HEIGHT);
  const ctx = cnv.getContext('2d');

  // Draw overlay background
  const overlayImg = await canvas.loadImage(overlayPath);
  ctx.drawImage(overlayImg, 0, 0, WIDTH, HEIGHT);

  // Draw card
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(CARD_X + 56, CARD_Y);
  ctx.lineTo(CARD_X + CARD_WIDTH - 56, CARD_Y);
  ctx.quadraticCurveTo(CARD_X + CARD_WIDTH, CARD_Y, CARD_X + CARD_WIDTH, CARD_Y + 56);
  ctx.lineTo(CARD_X + CARD_WIDTH, CARD_Y + CARD_HEIGHT - 56);
  ctx.quadraticCurveTo(CARD_X + CARD_WIDTH, CARD_Y + CARD_HEIGHT, CARD_X + CARD_WIDTH - 56, CARD_Y + CARD_HEIGHT);
  ctx.lineTo(CARD_X + 56, CARD_Y + CARD_HEIGHT);
  ctx.quadraticCurveTo(CARD_X, CARD_Y + CARD_HEIGHT, CARD_X, CARD_Y + CARD_HEIGHT - 56);
  ctx.lineTo(CARD_X, CARD_Y + 56);
  ctx.quadraticCurveTo(CARD_X, CARD_Y, CARD_X + 56, CARD_Y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Draw images
  if (image1) {
    try {
      let imgBuf;
      if (image1.startsWith('http')) {
        const resp = await axios.get(image1, { responseType: 'arraybuffer' });
        imgBuf = resp.data;
      } else {
        imgBuf = fs.readFileSync(image1);
      }
      const img = await canvas.loadImage(imgBuf);
      ctx.drawImage(img, LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT);
    } catch (e) {
      console.log('Left image failed:', e.message);
    }
  }
  if (image2) {
    try {
      let imgBuf;
      if (image2.startsWith('http')) {
        const resp = await axios.get(image2, { responseType: 'arraybuffer' });
        imgBuf = resp.data;
      } else {
        imgBuf = fs.readFileSync(image2);
      }
      const img = await canvas.loadImage(imgBuf);
      ctx.drawImage(img, RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT);
    } catch (e) {
      console.log('Right image failed:', e.message);
    }
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

  // Draw fact text
  ctx.fillStyle = '#222';
  ctx.font = 'bold 48px Arial';
  ctx.textBaseline = 'top';
  const factLines = wrapCanvasText(ctx, fact, CARD_WIDTH - 120, 48);
  let factY = CARD_Y + 60;
  for (let line of factLines) {
    ctx.fillText(line, CARD_X + 60, factY);
    factY += 56;
  }

  // Draw reply text
  ctx.fillStyle = '#444';
  ctx.font = '40px Arial';
  let replyY = IMAGE_Y + IMAGE_HEIGHT + 60;
  const replyLines = wrapCanvasText(ctx, reply, CARD_WIDTH - 120, 40);
  for (let line of replyLines) {
    ctx.fillText(line, CARD_X + 60, replyY);
    replyY += 48;
  }

  // Draw name and handle
  ctx.fillStyle = '#222';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(name, NAME_X, NAME_Y);
  ctx.fillStyle = '#888';
  ctx.font = '28px Arial';
  ctx.fillText(handle, NAME_X, HANDLE_Y);

  // Save output
  const out = fs.createWriteStream(outputPath);
  const stream = cnv.createPNGStream();
  stream.pipe(out);
  await new Promise(resolve => out.on('finish', resolve));
  console.log('✅ template1.js (canvas) generation completed successfully!');
} 