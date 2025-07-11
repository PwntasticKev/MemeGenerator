# SVG Template System Documentation

## Overview

The meme video generator uses a standardized SVG template system that allows you to create consistent templates with predefined placeholders for text and images.

## Standardized Placeholders

### Text Placeholders

All text placeholders use the following standardized naming convention:

- `{fact_here}` - The main fact text
- `{reply_here}` - The witty reply text  
- `{username_here}` - The username/display name
- `{handle_here}` - The handle/account name

### Image Placeholders

- **Two rectangles** with `fill="#CACACA"` - These will be replaced with the main images
- **One circle** with `fill="#D1CBCB"` - This will be replaced with the avatar image

## Template Structure

### Required Elements

1. **Background**: A full-size background rectangle
2. **Image Areas**: Two rectangles with `fill="#CACACA"` for main images
3. **Text Area**: A white rectangle for text content
4. **Avatar Circle**: One circle with `fill="#D1CBCB"` for avatar
5. **Text Elements**: SVG text elements with the standardized placeholders

### Example Template Structure

```xml
<svg width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1080" height="1920" fill="#878787"/>
  
  <!-- Main image areas (will be replaced) -->
  <g filter="url(#filter0_d)">
    <rect x="97" y="467" width="433" height="703" rx="15" fill="#CACACA"/>
  </g>
  <g filter="url(#filter1_d)">
    <rect x="543" y="467" width="433" height="703" rx="15" fill="#CACACA"/>
  </g>
  
  <!-- Text content area -->
  <g filter="url(#filter2_d)">
    <rect x="97" y="1208" width="879" height="369" rx="15" fill="white"/>
  </g>
  
  <!-- Avatar circle (will be replaced) -->
  <circle cx="198" cy="1317" r="54" fill="#D1CBCB"/>
  
  <!-- Text placeholders -->
  <text x="159" y="858" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="black">
    {fact_here}
  </text>
  
  <text x="159" y="1158" font-family="Arial, sans-serif" font-size="20" font-weight="normal" fill="black">
    {reply_here}
  </text>
  
  <text x="159" y="1358" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="black">
    {handle_here}
  </text>
  
  <text x="159" y="1380" font-family="Arial, sans-serif" font-size="16" font-weight="normal" fill="black">
    {username_here}
  </text>
</svg>
```

## Files Responsible for SVG Generation

### 1. Main Processing Function
**File**: `scripts/generateMeme.js` (lines 2000-2312)
**Function**: `renderSvgTemplate()`

This function:
- Loads SVG template files from `./templates/`
- Replaces image placeholders (rects with `fill="#CACACA"` or `#D1CBCB`)
- Handles text placeholders like `{fact_here}`, `{reply_here}`, etc.
- Processes text wrapping for long content
- Saves the modified SVG

### 2. Template Files
**Directory**: `./templates/`
**Files**: 
- `template_standard.svg` - The new standardized template
- `template1.js`, `template2.svg`, etc. - Legacy templates

### 3. Template Selection
**File**: `scripts/generateMeme.js` (lines 57-65)
**Functions**: 
- `getTemplateByIndex()` - Get template by number
- `getRandomTemplate()` - Get random template

## How the System Works

### 1. Template Loading
The system loads an SVG template file and parses it using JSDOM.

### 2. Image Placeholder Processing
- Finds rectangles with `fill="#CACACA"` (main images)
- Finds circles with `fill="#D1CBCB"` (avatar)
- Removes these elements and stores their positions for later compositing

### 3. Text Placeholder Replacement
- Scans all text elements for standardized placeholders
- Replaces `{fact_here}`, `{reply_here}`, `{username_here}`, `{handle_here}`
- Also supports legacy placeholders for backward compatibility

### 4. Text Wrapping
- Automatically wraps long text content
- Maintains proper line spacing and positioning
- Preserves font styling (family, size, weight, color)

### 5. Output Generation
- Saves the modified SVG to a temporary file
- The SVG is then converted to PNG and composited with images

## Creating New Templates

### Step 1: Create the SVG File
Create a new SVG file in the `./templates/` directory with the name `templateX.svg` where X is the template number.

### Step 2: Add Required Elements
1. **Background rectangle** covering the full canvas
2. **Two image rectangles** with `fill="#CACACA"`
3. **Text area rectangle** with white background
4. **Avatar circle** with `fill="#D1CBCB"`
5. **Text elements** with standardized placeholders

### Step 3: Use Standardized Placeholders
Use exactly these placeholders in your text elements:
- `{fact_here}`
- `{reply_here}`
- `{username_here}`
- `{handle_here}`

### Step 4: Test the Template
Use the test script to verify your template works:
```bash
node scripts/testStandardTemplate.js
```

## Testing Templates

### Test Script
**File**: `scripts/testStandardTemplate.js`

This script:
- Loads the standardized template
- Checks for all required placeholders
- Verifies image rectangles and avatar circle
- Tests placeholder replacement
- Saves test output to `./test_output/`

### Running Tests
```bash
node scripts/testStandardTemplate.js
```

## Backward Compatibility

The system maintains backward compatibility with:
- Legacy placeholder formats (`{fact here}`, `FACT_PLACEHOLDER`, etc.)
- Existing template files
- Old image placeholder formats

## Best Practices

### 1. Template Design
- Use consistent positioning for text elements
- Ensure adequate spacing between elements
- Test with long text content to verify wrapping

### 2. Image Areas
- Use exactly `fill="#CACACA"` for main image rectangles
- Use exactly `fill="#D1CBCB"` for avatar circle
- Position image areas to avoid overlapping with text

### 3. Text Styling
- Use web-safe fonts (Arial, sans-serif)
- Set appropriate font sizes for readability
- Use consistent text colors and weights

### 4. File Naming
- Use descriptive template names
- Follow the `templateX.svg` naming convention
- Document template purpose and layout

## Troubleshooting

### Common Issues

1. **Placeholders not replaced**: Check for exact placeholder spelling
2. **Images not appearing**: Verify rectangle fill colors are correct
3. **Text wrapping issues**: Check max-width settings in the rendering function
4. **Template not found**: Ensure file is in `./templates/` directory

### Debug Steps

1. Run the test script to verify template structure
2. Check SVG file syntax and structure
3. Verify placeholder names match exactly
4. Test with the main generation script

## Example Usage

```javascript
// Generate a meme using the standardized template
const result = await renderSvgTemplate({
    templateNum: 'standard',
    images: [image1, image2],
    avatar: avatarImage,
    fact: "Your fact here",
    reply: "Your reply here", 
    handle: "@yourhandle",
    name: "Your Name",
    outputPath: "./output/meme.png"
});
``` 