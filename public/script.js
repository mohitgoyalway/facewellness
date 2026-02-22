const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const startBtn = document.getElementById('startScanner');
const setupView = document.getElementById('setupView');
const scannerView = document.getElementById('scannerView');
const statusText = document.getElementById('statusText');
const statusDot = document.querySelector('.status-dot');
const progressPercent = document.getElementById('progressPercent');
const progressCircle = document.querySelector('.progress-ring__circle');
const analysisOverlay = document.getElementById('analysisOverlay');
const dataStream = document.getElementById('dataStream');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const resetBtn = document.getElementById('resetBtn');

let isAnalyzing = false;
let detectionInterval;
let modelsLoaded = false;

// Load face-api models
async function loadModels() {
    statusText.textContent = "LOADING NEURAL MODELS...";
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
    
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        statusText.textContent = "SYSTEM READY";
        statusDot.classList.add('active');
    } catch (e) {
        console.error("Model load failed", e);
        statusText.textContent = "MODEL ERROR";
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
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections.length > 0) {
            statusText.textContent = "SUBJECT DETECTED";
            statusDot.style.background = "#00ff88";
            
            // Draw sci-fi box
            detections.forEach(detection => {
                const { x, y, width, height } = detection.detection.box;
                drawSciFiBox(ctx, x, y, width, height);
            });

            // Trigger analysis if face is stable (simplified: just trigger first detection)
            if (!isAnalyzing) {
                triggerAnalysis();
            }
        } else {
            statusText.textContent = "SCANNING FOR SUBJECT...";
            statusDot.style.background = "#ff0000";
        }
    }, 200);
}

function drawSciFiBox(ctx, x, y, w, h) {
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 10]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    
    // Corner brackets
    const len = 20;
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
    
    // Capture current frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext('2d').drawImage(video, 0, 0);
    const base64Image = tempCanvas.toDataURL('image/jpeg').split(',')[1];

    // Progress Simulation
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 95) progress = 95;
        updateProgress(progress);
        updateDataStream();
    }, 400);

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
        }, 500);

    } catch (err) {
        console.error("Analysis failed", err);
        alert("Bioscan link failed. Check connection.");
        resetScanner();
    }
}

function updateProgress(percent) {
    const rounded = Math.round(percent);
    progressPercent.textContent = `${rounded}%`;
    const offset = 326.7 - (rounded / 100 * 326.7);
    progressCircle.style.strokeDashoffset = offset;
}

const streams = [
    "ENCRYPTING BIOMETRIC DATA...",
    "EXTRACTING DERMAL TEXTURES...",
    "RUNNING NEURAL ESTIMATION...",
    "CALIBRATING FATIGUE VECTORS...",
    "MAPPING FACIAL LANDMARKS...",
    "CROSS-REFERENCING LIFESTYLE CUES...",
    "SYNCHRONIZING WITH CORE CLOUD..."
];

function updateDataStream() {
    const text = streams[Math.floor(Math.random() * streams.length)];
    dataStream.textContent = text;
}

function showResults(data) {
    scannerView.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsGrid.innerHTML = '';

    const keys = {
        stressLevel: '🧠 Stress Level',
        tiredness: '😴 Tiredness',
        estimatedAge: '🎂 Estimated Age',
        skinObservations: '✨ Skin Observations',
        fatigueSigns: '📉 Fatigue Signs',
        lifestyleHabits: '🧘 Lifestyle Habits'
    };

    for (const [key, label] of Object.entries(keys)) {
        if (data[key] || data.raw) {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `<h3>${label}</h3><p>${data[key] || data.raw}</p>`;
            resultsGrid.appendChild(card);
        }
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
