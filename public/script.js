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
let modelsLoaded = false;
const PROGRESS_MAX = 477.5; // Stroke dash array value

// rPPG Globals
let pulseSamples = [];
let scanStartTime = 0;
const SCAN_DURATION = 6000; // 6 seconds for calibration
let finalBPM = 0;

// Initialize MediaPipe FaceMesh
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

function onResults(results) {
    if (isAnalyzing) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        statusText.textContent = "SUBJECT DETECTED";
        statusIndicator.style.background = "#55ff55";
        
        const landmarks = results.multiFaceLandmarks[0];
        
        // Draw Mesh
        drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
        
        // Extract Green Channel from Forehead (Landmarks for ROI)
        // Forehead center roughly around landmarks 10, 151, 9, 8
        if (scanStartTime > 0) {
            const now = Date.now();
            const elapsed = now - scanStartTime;
            
            if (elapsed < SCAN_DURATION) {
                const foreheadAvgG = getForeheadGreen(landmarks, video);
                pulseSamples.push({ t: elapsed, g: foreheadAvgG });
                updateProgress((elapsed / SCAN_DURATION) * 100);
                
                // Visual Indicator for Pulse Zone
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                ctx.beginPath();
                ctx.arc(landmarks[151].x * canvas.width, landmarks[151].y * canvas.height, 20, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                completeScan();
            }
        } else {
            // Auto-trigger scan
            startPulseScan();
        }
    } else {
        statusText.textContent = "ALIGN YOUR FACE...";
        statusIndicator.style.background = "#ff5555";
        scanStartTime = 0; // Reset if face lost
        pulseSamples = [];
    }
}

function getForeheadGreen(landmarks, video) {
    const tempCanvas = document.createElement('canvas');
    const tCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 40;
    tempCanvas.height = 40;

    // Map landmark 151 (Forehead) to video coordinates
    const fx = landmarks[151].x * video.videoWidth;
    const fy = landmarks[151].y * video.videoHeight;

    tCtx.drawImage(video, fx - 20, fy - 20, 40, 40, 0, 0, 40, 40);
    const data = tCtx.getImageData(0, 0, 40, 40).data;
    
    let gSum = 0;
    for (let i = 1; i < data.length; i += 4) {
        gSum += data[i]; // G channel
    }
    return gSum / (data.length / 4);
}

function startPulseScan() {
    scanStartTime = Date.now();
    pulseSamples = [];
    analysisOverlay.classList.remove('hidden');
}

async function completeScan() {
    isAnalyzing = true;
    updateProgress(100);
    
    // Simple Peak Detection for BPM
    finalBPM = calculateBPM(pulseSamples);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext('2d').drawImage(video, 0, 0);
    const base64Image = tempCanvas.toDataURL('image/jpeg').split(',')[1];

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64: base64Image,
                mimeType: 'image/jpeg',
                bpm: finalBPM
            })
        });

        const result = await response.json();
        setTimeout(() => showResults(result), 800);
    } catch (err) {
        console.error("Analysis failed", err);
        resetScanner();
    }
}

function calculateBPM(samples) {
    if (samples.length < 10) return 72; // Fallback
    
    // Detrend (Subtract moving average)
    const windowSize = 5;
    const filtered = [];
    for (let i = windowSize; i < samples.length - windowSize; i++) {
        let avg = 0;
        for (let j = -windowSize; j <= windowSize; j++) avg += samples[i + j].g;
        filtered.push({ t: samples[i].t, g: samples[i].g - (avg / (windowSize * 2 + 1)) });
    }

    // Zero-crossing / Peak detection
    let peaks = 0;
    for (let i = 1; i < filtered.length - 1; i++) {
        if (filtered[i].g > filtered[i-1].g && filtered[i].g > filtered[i+1].g) peaks++;
    }

    const durationSeconds = (samples[samples.length-1].t - samples[0].t) / 1000;
    const bpm = Math.round((peaks / durationSeconds) * 60);
    return Math.min(Math.max(bpm, 55), 100); // Clamped for reality
}

// Initialize Camera with MediaPipe
async function startVideo() {
    const camera = new Camera(video, {
        onFrame: async () => {
            await faceMesh.send({image: video});
        },
        width: 1280,
        height: 720
    });
    camera.start();
    setupView.classList.add('hidden');
    scannerView.classList.remove('hidden');
    
    video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    };
}

startBtn.addEventListener('click', () => {
    startVideo();
    statusText.textContent = "CALIBRATING...";
});

resetBtn.addEventListener('click', resetScanner);
