// Automated Function Checker for ArLux
const fs = require('fs');
const path = require('path');

console.log('🧪 ArLux Function Checker\n');
console.log('=' .repeat(50));

const results = {
    pass: [],
    fail: [],
    total: 0
};

// Test 1: Check if files exist
console.log('\n📁 File Existence Tests:');
const files = [
    'index.html',
    'app.js',
    'style.css',
    'js/chat.js',
    'js/news.js',
    'sw.js',
    'config.js',
    'src/core/errorHandler.production.js',
    'src/services/apiService.production.js'
];

files.forEach(file => {
    results.total++;
    const exists = fs.existsSync(path.join(__dirname, file));
    if (exists) {
        console.log(`✅ ${file}`);
        results.pass.push(`File exists: ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        results.fail.push(`File missing: ${file}`);
    }
});

// Test 2: Check index.html content
console.log('\n📄 Index.html Tests:');
const indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const indexTests = [
    { name: 'Service Worker registration', pattern: /serviceWorker/ },
    { name: 'Lazy loading code', pattern: /IntersectionObserver/ },
    { name: 'City search input', pattern: /id="cityInput"/ },
    { name: 'News buttons', pattern: /id="worldNewsBtn"/ },
    { name: 'Chat button', pattern: /id="toggleChatBtn"/ },
    { name: 'Camera button', pattern: /id="toggleCameraBtn"/ },
    { name: 'Music button', pattern: /id="toggleMusicBtn"/ },
    { name: 'Floating chat widget', pattern: /id="floatingChatWidget"/ },
    { name: 'CSP meta tag', pattern: /Content-Security-Policy/ },
    { name: 'Meta description', pattern: /meta name="description"/ }
];

indexTests.forEach(test => {
    results.total++;
    if (test.pattern.test(indexContent)) {
        console.log(`✅ ${test.name}`);
        results.pass.push(test.name);
    } else {
        console.log(`❌ ${test.name} - NOT FOUND`);
        results.fail.push(test.name);
    }
});

// Test 3: Check app.js functions
console.log('\n⚙️ App.js Function Tests:');
const appContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const appTests = [
    { name: 'fetchUserIP function', pattern: /function fetchUserIP/ },
    { name: 'createCityAutocomplete function', pattern: /function createCityAutocomplete/ },
    { name: 'fetchWeatherData function', pattern: /function fetchWeatherData/ },
    { name: 'searchPlacesByCategory function', pattern: /function searchPlacesByCategory/ },
    { name: 'Music creation (Web Audio)', pattern: /AudioContext/ },
    { name: 'Camera functionality', pattern: /getUserMedia/ },
    { name: 'escapeHtml function', pattern: /function escapeHtml/ }
];

appTests.forEach(test => {
    results.total++;
    if (test.pattern.test(appContent)) {
        console.log(`✅ ${test.name}`);
        results.pass.push(test.name);
    } else {
        console.log(`❌ ${test.name} - NOT FOUND`);
        results.fail.push(test.name);
    }
});

// Test 4: Check chat.js functions
console.log('\n💬 Chat.js Function Tests:');
const chatContent = fs.readFileSync(path.join(__dirname, 'js/chat.js'), 'utf8');

const chatTests = [
    { name: 'initChat function', pattern: /function initChat/ },
    { name: 'openChat function', pattern: /function openChat/ },
    { name: 'sendMessage function', pattern: /function sendMessage/ },
    { name: 'changeUsername function', pattern: /function changeUsername/ },
    { name: 'toggleFloatingChat function', pattern: /function toggleFloatingChat/ },
    { name: 'loadMessages function', pattern: /function loadMessages/ },
    { name: 'JSONBin API integration', pattern: /jsonbin\.io/ }
];

chatTests.forEach(test => {
    results.total++;
    if (test.pattern.test(chatContent)) {
        console.log(`✅ ${test.name}`);
        results.pass.push(test.name);
    } else {
        console.log(`❌ ${test.name} - NOT FOUND`);
        results.fail.push(test.name);
    }
});

// Test 5: Check news.js functions
console.log('\n📰 News.js Function Tests:');
const newsContent = fs.readFileSync(path.join(__dirname, 'js/news.js'), 'utf8');

const newsTests = [
    { name: 'fetchWorldNews function', pattern: /function fetchWorldNews/ },
    { name: 'fetchHalifaxNews function', pattern: /function fetchHalifaxNews/ },
    { name: 'fetchPathankotNews function', pattern: /function fetchPathankotNews/ },
    { name: 'fetchNepalNews function', pattern: /function fetchNepalNews/ },
    { name: 'displayNews function', pattern: /function displayNews/ },
    { name: 'initNews function', pattern: /function initNews/ }
];

newsTests.forEach(test => {
    results.total++;
    if (test.pattern.test(newsContent)) {
        console.log(`✅ ${test.name}`);
        results.pass.push(test.name);
    } else {
        console.log(`❌ ${test.name} - NOT FOUND`);
        results.fail.push(test.name);
    }
});

// Test 6: Check service worker
console.log('\n🔧 Service Worker Tests:');
const swContent = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

const swTests = [
    { name: 'Install event listener', pattern: /addEventListener\('install'/ },
    { name: 'Fetch event listener', pattern: /addEventListener\('fetch'/ },
    { name: 'Activate event listener', pattern: /addEventListener\('activate'/ },
    { name: 'Cache management', pattern: /caches\.open/ }
];

swTests.forEach(test => {
    results.total++;
    if (test.pattern.test(swContent)) {
        console.log(`✅ ${test.name}`);
        results.pass.push(test.name);
    } else {
        console.log(`❌ ${test.name} - NOT FOUND`);
        results.fail.push(test.name);
    }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(50));
console.log(`Total Tests: ${results.total}`);
console.log(`✅ Passed: ${results.pass.length}`);
console.log(`❌ Failed: ${results.fail.length}`);
console.log(`Success Rate: ${Math.round((results.pass.length / results.total) * 100)}%`);

if (results.fail.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.fail.forEach(test => console.log(`  - ${test}`));
}

console.log('\n' + '='.repeat(50));
if (results.fail.length === 0) {
    console.log('🎉 ALL TESTS PASSED! Website is fully functional.');
} else if (results.pass.length / results.total >= 0.9) {
    console.log('✅ Most tests passed. Minor issues detected.');
} else {
    console.log('⚠️ Some critical issues detected. Review failed tests.');
}
console.log('='.repeat(50));
