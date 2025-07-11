# Multi-Account Video Generation

## Overview

The meme video generator now supports generating videos for all 3 accounts simultaneously with the same content but different overlays and account-specific styling.

## What Was Fixed

### 1. Template Generation Issue
**Problem**: The `getRandomOverlay()` function was hardcoded to only look in `./assets` directory, but overlays are organized by account in `account_1/`, `account_2/`, `account_3/` directories.

**Solution**: Modified `getRandomOverlay(accountNumber)` to:
- Accept an account number parameter
- Look in the correct account directory (`./account_${accountNumber}`)
- Fall back to `./assets` if account directory doesn't exist
- Use account-specific overlays for each generation

### 2. Single Account Generation
**Problem**: The system only generated one video per run.

**Solution**: Added `--all-accounts` flag that:
- Generates the same content for all 3 accounts
- Uses account-specific overlays for each account
- Creates separate output folders for each account
- Generates account-specific handles/names via GPT
- Provides a summary of all generated videos

## How to Use

### Generate for All Accounts
```bash
# Generate videos for all 3 accounts with same content
node scripts/generateMeme.js --all-accounts

# Skip review prompts and auto-schedule
node scripts/generateMeme.js --all-accounts --skip-review

# With custom settings
node scripts/generateMeme.js --all-accounts --font-size=56 --text-color=white
```

### Generate for Single Account (Original Behavior)
```bash
# Generate for single account (interactive)
node scripts/generateMeme.js

# Generate for specific account
node scripts/generateMeme.js --skip-review
```

## Output Structure

When using `--all-accounts`, the output structure is:

```
output/
└── 2025-07-11/
    └── Squid_Game_twist_20250711054507/
        ├── gpt_response.json                    # Shared GPT response
        ├── account_1/
        │   ├── frame.png                        # Account 1 image
        │   ├── video.mp4                        # Account 1 video
        │   └── debug_text.svg                   # Account 1 debug SVG
        ├── account_2/
        │   ├── frame.png                        # Account 2 image
        │   ├── video.mp4                        # Account 2 video
        │   └── debug_text.svg                   # Account 2 debug SVG
        └── account_3/
            ├── frame.png                        # Account 3 image
            ├── video.mp4                        # Account 3 video
            └── debug_text.svg                   # Account 3 debug SVG
```

## Account-Specific Features

### 1. Overlay Selection
- **Account 1**: Uses overlays from `./account_1/`
- **Account 2**: Uses overlays from `./account_2/`
- **Account 3**: Uses overlays from `./account_3/`

### 2. Content Variation
Each account gets slightly different content:
- **Account 1**: Normal posting style
- **Account 2**: Girl posting style with "omg", "literally", "obsessed" language
- **Account 3**: Normal posting style

### 3. Character Names/Handles
Each account gets unique character-related names and handles based on the topic.

## Files Modified

1. **`scripts/generateMeme.js`**:
   - Modified `getRandomOverlay()` to accept account number
   - Added `generateForAllAccounts()` function
   - Added `--all-accounts` flag support
   - Updated help text

2. **`scripts/testOverlaySelection.js`** (new):
   - Test script to verify overlay selection works correctly

3. **`scripts/testAllAccounts.js`** (new):
   - Test script for all-accounts functionality

## Testing

### Test Overlay Selection
```bash
node scripts/testOverlaySelection.js
```

### Test All Accounts Generation
```bash
node scripts/testAllAccounts.js
```

## Example Output

```
🎬 Generating videos for all accounts...

🎬 Generating for Account 1...
[DEBUG] Using overlay for account 1: account_1/mainoverlay_3.png
✅ SVG template generation completed for account 1!
✅ Video creation completed for account 1!

🎬 Generating for Account 2...
[DEBUG] Using overlay for account 2: account_2/mainoverlay_6.png
✅ SVG template generation completed for account 2!
✅ Video creation completed for account 2!

🎬 Generating for Account 3...
[DEBUG] Using overlay for account 3: account_3/mainoverlay_7.png
✅ SVG template generation completed for account 3!
✅ Video creation completed for account 3!

📊 Generation Summary:
✅ Successful: 3/3 accounts
   - Account 1: ./output/2025-07-11/Squid_Game_twist_20250711054507/account_1/video.mp4
   - Account 2: ./output/2025-07-11/Squid_Game_twist_20250711054507/account_2/video.mp4
   - Account 3: ./output/2025-07-11/Squid_Game_twist_20250711054507/account_3/video.mp4
```

## Benefits

1. **Efficiency**: Generate content for all accounts in one command
2. **Consistency**: Same topic/fact across all accounts
3. **Variety**: Different overlays and account-specific styling
4. **Organization**: Clean output structure with account-specific folders
5. **Automation**: Perfect for batch processing and scheduling

## Future Enhancements

- Add account-specific scheduling (different times for each account)
- Add account-specific templates
- Add account-specific image selection
- Add account-specific hashtags and descriptions 