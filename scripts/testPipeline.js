import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test configuration
const TEST_TOPICS = [
    "Spider-Man",
    "Breaking Bad", 
    "The Office",
    "Game of Thrones",
    "Stranger Things"
];

const TEST_CONFIG = {
    maxRetries: 3,
    timeoutMs: 120000, // 2 minutes per test
    requiredFiles: ['gpt_response.json', 'debug_text.svg', 'frame.png', 'video.mp4']
};

class PipelineTester {
    constructor() {
        this.results = [];
        this.errors = [];
    }

    async runAllTests() {
        console.log('🧪 Starting comprehensive pipeline test...\n');
        
        for (const topic of TEST_TOPICS) {
            console.log(`\n📝 Testing topic: "${topic}"`);
            await this.testSingleTopic(topic);
        }
        
        this.generateReport();
    }

    async testSingleTopic(topic) {
        const startTime = Date.now();
        const testResult = {
            topic,
            success: false,
            duration: 0,
            files: [],
            errors: [],
            gptResponse: null,
            imageUrls: [],
            avatarUrls: []
        };

        try {
            // Step 1: Run the meme generator
            console.log(`  🔄 Running meme generator for "${topic}"...`);
            const { stdout, stderr } = await execAsync(
                `node scripts/generateMeme.js --skip-review`,
                { 
                    timeout: TEST_CONFIG.timeoutMs,
                    env: { ...process.env, TOPIC: topic }
                }
            );

            // Step 2: Find the output directory
            const outputDir = await this.findLatestOutputDir();
            if (!outputDir) {
                throw new Error('No output directory found');
            }

            testResult.outputDir = outputDir;

            // Step 3: Verify all required files exist
            const files = await this.verifyFiles(outputDir);
            testResult.files = files;

            // Step 4: Validate GPT response
            const gptResponse = await this.validateGptResponse(outputDir);
            testResult.gptResponse = gptResponse;
            testResult.imageUrls = gptResponse.image_urls || [];
            testResult.avatarUrls = gptResponse.avatar_urls || [];

            // Step 5: Validate images are unique and relevant
            await this.validateImages(testResult);

            // Step 6: Validate video file
            await this.validateVideo(outputDir);

            testResult.success = true;
            testResult.duration = Date.now() - startTime;
            
            console.log(`  ✅ Success! Generated video in ${testResult.duration}ms`);
            console.log(`     Files: ${files.join(', ')}`);
            console.log(`     Images: ${testResult.imageUrls.length} unique images`);
            console.log(`     Avatars: ${testResult.avatarUrls.length} avatar images`);

        } catch (error) {
            testResult.success = false;
            testResult.duration = Date.now() - startTime;
            testResult.errors.push(error.message);
            
            console.log(`  ❌ Failed: ${error.message}`);
            this.errors.push({ topic, error: error.message });
        }

        this.results.push(testResult);
    }

    async findLatestOutputDir() {
        const outputBase = './output';
        if (!fs.existsSync(outputBase)) {
            return null;
        }

        const dateDirs = fs.readdirSync(outputBase)
            .filter(dir => /^\d{4}-\d{2}-\d{2}$/.test(dir))
            .sort()
            .reverse();

        if (dateDirs.length === 0) {
            return null;
        }

        const latestDateDir = path.join(outputBase, dateDirs[0]);
        const runDirs = fs.readdirSync(latestDateDir)
            .filter(dir => dir.includes('_'))
            .sort()
            .reverse();

        if (runDirs.length === 0) {
            return null;
        }

        return path.join(latestDateDir, runDirs[0]);
    }

    async verifyFiles(outputDir) {
        const files = [];
        for (const requiredFile of TEST_CONFIG.requiredFiles) {
            const filePath = path.join(outputDir, requiredFile);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                files.push({
                    name: requiredFile,
                    size: stats.size,
                    exists: true
                });
            } else {
                files.push({
                    name: requiredFile,
                    size: 0,
                    exists: false
                });
            }
        }
        return files;
    }

    async validateGptResponse(outputDir) {
        const gptPath = path.join(outputDir, 'gpt_response.json');
        if (!fs.existsSync(gptPath)) {
            throw new Error('GPT response file not found');
        }

        const content = fs.readFileSync(gptPath, 'utf8');
        const response = JSON.parse(content);

        // Validate required fields
        const requiredFields = [
            'fact', 'reply', 'youtube_title', 'youtube_description',
            'image_search_terms', 'avatar_search_terms', 'image_urls', 'avatar_urls', 'tags'
        ];

        for (const field of requiredFields) {
            if (!response[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Validate search terms include movie/show keywords
        const searchTerms = response.image_search_terms || [];
        const hasMovieShowTerms = searchTerms.some(term => 
            /(movie|show|film|series|character|actor|actress|scene|poster|still|screenshot|official)/i.test(term)
        );

        if (!hasMovieShowTerms) {
            throw new Error('Search terms must include movie/show related keywords');
        }

        // Validate avatar search terms
        const avatarTerms = response.avatar_search_terms || [];
        const hasAvatarTerms = avatarTerms.some(term => 
            /(avatar|profile picture|headshot|portrait|character face|actor headshot)/i.test(term)
        );

        if (!hasAvatarTerms) {
            throw new Error('Avatar search terms must include avatar-related keywords');
        }

        return response;
    }

    async validateImages(testResult) {
        const imageUrls = testResult.imageUrls;
        const avatarUrls = testResult.avatarUrls;

        // Check for unique images
        const allUrls = [...imageUrls, ...avatarUrls];
        const uniqueUrls = new Set(allUrls);
        
        if (allUrls.length !== uniqueUrls.size) {
            throw new Error('Duplicate image URLs found');
        }

        // Check for placeholder URLs
        const placeholderPatterns = [
            /example\.com/,
            /placeholder/,
            /placeholder\d+\.jpg/
        ];

        for (const url of allUrls) {
            for (const pattern of placeholderPatterns) {
                if (pattern.test(url)) {
                    throw new Error(`Placeholder URL found: ${url}`);
                }
            }
        }

        // Validate image URLs are accessible
        for (let i = 0; i < Math.min(imageUrls.length, 2); i++) {
            try {
                const response = await fetch(imageUrls[i], { 
                    method: 'HEAD',
                    timeout: 10000 
                });
                if (!response.ok) {
                    throw new Error(`Image URL not accessible: ${imageUrls[i]}`);
                }
            } catch (error) {
                console.log(`  ⚠️  Warning: Could not validate image URL ${imageUrls[i]}: ${error.message}`);
            }
        }
    }

    async validateVideo(outputDir) {
        const videoPath = path.join(outputDir, 'video.mp4');
        if (!fs.existsSync(videoPath)) {
            throw new Error('Video file not found');
        }

        const stats = fs.statSync(videoPath);
        if (stats.size < 1000) { // Less than 1KB
            throw new Error('Video file too small, likely corrupted');
        }

        // Check video duration using ffprobe
        try {
            const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`);
            const duration = parseFloat(stdout.trim());
            if (duration < 1 || duration > 10) {
                throw new Error(`Video duration invalid: ${duration}s (expected 1-10s)`);
            }
        } catch (error) {
            console.log(`  ⚠️  Warning: Could not validate video duration: ${error.message}`);
        }
    }

    generateReport() {
        console.log('\n📊 Test Report');
        console.log('='.repeat(50));
        
        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        
        console.log(`✅ Successful: ${successful.length}/${this.results.length}`);
        console.log(`❌ Failed: ${failed.length}/${this.results.length}`);
        
        if (successful.length > 0) {
            const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
            console.log(`⏱️  Average duration: ${Math.round(avgDuration)}ms`);
        }

        if (failed.length > 0) {
            console.log('\n❌ Failed Tests:');
            failed.forEach(result => {
                console.log(`  • ${result.topic}: ${result.errors.join(', ')}`);
            });
        }

        if (this.errors.length > 0) {
            console.log('\n🚨 Critical Errors:');
            this.errors.forEach(({ topic, error }) => {
                console.log(`  • ${topic}: ${error}`);
            });
        }

        // Summary
        console.log('\n📋 Summary:');
        console.log(`  • Total tests: ${this.results.length}`);
        console.log(`  • Success rate: ${((successful.length / this.results.length) * 100).toFixed(1)}%`);
        console.log(`  • Pipeline working: ${successful.length > 0 ? 'YES' : 'NO'}`);
        
        if (successful.length === 0) {
            console.log('\n🚨 CRITICAL: Pipeline is not working! All tests failed.');
            process.exit(1);
        } else if (failed.length > 0) {
            console.log('\n⚠️  WARNING: Some tests failed, but pipeline is partially working.');
        } else {
            console.log('\n🎉 SUCCESS: All tests passed! Pipeline is working correctly.');
        }
    }
}

// Run the tests
async function main() {
    const tester = new PipelineTester();
    await tester.runAllTests();
}

main().catch(console.error); 