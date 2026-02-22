const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const startBtn = document.getElementById('startScanner');
const setupView = document.getElementById('setupView');
const scannerView = document.getElementById('scannerView');
const statusText = document.getElementById('statusText');
const statusIndicator = document.querySelector('.status-indicator');
const progressPercent = document.getElementById('progressPercent');
const progressCircle = document.getElementById('progressCircle');
const analysisOverlay = document.getElementById('analysisOverlay');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const recommendationPanel = document.getElementById('recommendationPanel');
const resetBtn = document.getElementById('resetBtn');

let isAnalyzing = false;
let detectionInterval;
let modelsLoaded = false;
const PROGRESS_MAX = 477.5; // Stroke dash array value

// Load face-api models
async function loadModels() {
    statusText.textContent = "SYNCHRONIZING MODELS...";
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
    
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        statusText.textContent = "SCANNER READY";
        statusIndicator.classList.add('active');
    } catch (e) {
        console.error("Model load failed", e);
        statusText.textContent = "SYSTEM OFFLINE";
    }
}

// Initialize Camera
async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        video.srcObject = stream;
        setupView.classList.add('hidden');
        scannerView.classList.remove('hidden');
        
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            startDetection();
        };
    } catch (err) {
        console.error("Camera access denied", err);
        alert("Camera access is required for BIOSCAN.");
    }
}

function startDetection() {
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    detectionInterval = setInterval(async () => {
        if (isAnalyzing) return;

        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections.length > 0) {
            statusText.textContent = "SUBJECT DETECTED";
            statusIndicator.style.background = "#55ff55";
            
            // Premium scan frame
            detections.forEach(detection => {
                const { x, y, width, height } = detection.detection.box;
                drawPremiumBox(ctx, x, y, width, height);
            });

            // Trigger analysis automatically
            if (!isAnalyzing) {
                triggerAnalysis();
            }
        } else {
            statusText.textContent = "ALIGN YOUR FACE...";
            statusIndicator.style.background = "#ff5555";
        }
    }, 250);
}

function drawPremiumBox(ctx, x, y, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    
    // Corner brackets - minimal & elegant
    const len = 15;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // TL
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    // TR
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    // BL
    ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h);
    // BR
    ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
    ctx.stroke();
}

async function triggerAnalysis() {
    isAnalyzing = true;
    analysisOverlay.classList.remove('hidden');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext('2d').drawImage(video, 0, 0);
    const base64Image = tempCanvas.toDataURL('image/jpeg').split(',')[1];

    // Smooth Progress Simulation
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 8;
        if (progress > 98) progress = 98;
        updateProgress(progress);
    }, 300);

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64: base64Image,
                mimeType: 'image/jpeg'
            })
        });

        const result = await response.json();
        
        clearInterval(interval);
        updateProgress(100);
        
        setTimeout(() => {
            showResults(result);
        }, 800);

    } catch (err) {
        console.error("Analysis failed", err);
        alert("Bioscan link failed. Check connection.");
        resetScanner();
    }
}

function updateProgress(percent) {
    const rounded = Math.round(percent);
    progressPercent.textContent = `${rounded}%`;
    const offset = PROGRESS_MAX - (rounded / 100 * PROGRESS_MAX);
    progressCircle.style.strokeDashoffset = offset;
}

function showResults(data) {
    scannerView.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsGrid.innerHTML = '';

    const categories = [
        { key: 'vitality', label: 'Vitality Index' },
        { key: 'skin', label: 'Skin Resilience' },
        { key: 'rest', label: 'Rest Quality' },
        { key: 'age', label: 'Biological Age' },
        { key: 'cardio', label: 'Cardio Harmony' },
        { key: 'metabolic', label: 'Metabolic Balance' },
        { key: 'liver', label: 'Internal Filter' }
    ];

    categories.forEach(cat => {
        const item = data[cat.key];
        if (!item) return;

        const card = document.createElement('div');
        const score = item.score || 0;
        const colorClass = score > 80 ? 'score-high' : (score > 60 ? 'score-medium' : 'score-low');
        
        card.className = `score-card ${colorClass}`;
        card.style.cssText = `
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--glass-border);
            padding: 1.5rem;
            border-radius: 15px;
            text-align: left;
        `;
        
        card.innerHTML = `
            <h3 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 1rem;">${cat.label}</h3>
            <div class="score-display" style="display: flex; align-items: baseline; gap: 5px;">
                <span class="score-value" style="font-size: 2.2rem; font-family: var(--font-heading); font-weight: 600;">${score || item.range || '--'}</span>
                <span style="opacity: 0.3; font-size: 0.8rem;">${score ? '/100' : ''}</span>
            </div>
            <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 10px;">${item.observation || ''}</p>
        `;
        resultsGrid.appendChild(card);
    });

    // Create Archetype Card
    const arch = data.archetype;
    if (arch) {
        const archetypeCard = document.createElement('div');
        archetypeCard.className = 'archetype-card';
        archetypeCard.style.setProperty('--aura-color', arch.aura || '#fff');
        archetypeCard.innerHTML = `
            <div class="character-aura-display">
                <span class="char-icon">🔱</span>
            </div>
            <div class="archetype-info">
                <h4>MAHABHARAT ARCHETYPE</h4>
                <h2>${arch.name}</h2>
                <p>${arch.reason}</p>
            </div>
        `;
        
        const tipPanel = document.createElement('div');
        tipPanel.className = 'secret-tip-panel';
        tipPanel.style.marginTop = '2rem';
        tipPanel.innerHTML = `
            <p>"${data.secretTip ? data.secretTip.tip : 'Practice daily mindful breathing for longevity.'}"</p>
        `;

        const container = document.createElement('div');
        container.className = 'archetype-container';
        container.appendChild(archetypeCard);
        container.appendChild(tipPanel);
        resultsGrid.appendChild(container);
    }

    if (data.recommendation) {
        recommendationPanel.innerHTML = `
            <h4>Daily Wellness Action</h4>
            <p>"${data.recommendation.action}"</p>
        `;
    }
}

function resetScanner() {
    isAnalyzing = false;
    resultsSection.classList.add('hidden');
    scannerView.classList.remove('hidden');
    analysisOverlay.classList.add('hidden');
    updateProgress(0);
}

startBtn.addEventListener('click', () => {
    startVideo();
    loadModels();
});

resetBtn.addEventListener('click', resetScanner);
