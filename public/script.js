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
const PROGRESS_MAX = 477.5; // Stroke dash array value

// Deep Biometric Globals
let pulseSamples = [];
let respirationSamples = [];
let blinkCount = 0;
let eyeClosed = false;
let scanStartTime = 0;
const SCAN_DURATION = 15000; // 15 seconds for Deep Scan
let finalBPM = 0;
let finalRespiration = 0;
let finalBlinks = 0;
let finalHRV = 0;

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
        statusText.textContent = "DEEP SCAN IN PROGRESS";
        statusIndicator.style.background = "#55ff55";
        
        const landmarks = results.multiFaceLandmarks[0];
        
        // Draw Mesh
        drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
        
        if (scanStartTime > 0) {
            const now = Date.now();
            const elapsed = now - scanStartTime;
            
            if (elapsed < SCAN_DURATION) {
                // 1. rPPG (Heart Rate) - Forehead Landmark 151
                const foreheadAvgG = getForeheadGreen(landmarks, video);
                pulseSamples.push({ t: elapsed, g: foreheadAvgG });
                
                // 2. Respiration (Nose vertical oscillation) - Nose Tip Landmark 1
                respirationSamples.push({ t: elapsed, y: landmarks[1].y });

                // 3. Blink Detection (Eye Aspect Ratio)
                detectBlink(landmarks);

                updateProgress((elapsed / SCAN_DURATION) * 100);
                
                // Visual Pulse Indicator
                ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                ctx.beginPath();
                ctx.arc(landmarks[151].x * canvas.width, landmarks[151].y * canvas.height, 20, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                completeScan();
            }
        } else {
            startPulseScan();
        }
    } else {
        statusText.textContent = "ALIGN FOR BIOSCAN...";
        statusIndicator.style.background = "#ff5555";
        scanStartTime = 0;
        pulseSamples = [];
        respirationSamples = [];
        blinkCount = 0;
    }
}

function detectBlink(landmarks) {
    const top = landmarks[159].y;
    const bottom = landmarks[145].y;
    const distance = Math.abs(top - bottom);
    if (distance < 0.015) {
        if (!eyeClosed) {
            eyeClosed = true;
            blinkCount++;
        }
    } else {
        eyeClosed = false;
    }
}

function getForeheadGreen(landmarks, video) {
    const tempCanvas = document.createElement('canvas');
    const tCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 40;
    tempCanvas.height = 40;
    const fx = landmarks[151].x * video.videoWidth;
    const fy = landmarks[151].y * video.videoHeight;
    tCtx.drawImage(video, fx - 20, fy - 20, 40, 40, 0, 0, 40, 40);
    const data = tCtx.getImageData(0, 0, 40, 40).data;
    let gSum = 0;
    for (let i = 1; i < data.length; i += 4) gSum += data[i];
    return gSum / (data.length / 4);
}

function startPulseScan() {
    scanStartTime = Date.now();
    pulseSamples = [];
    respirationSamples = [];
    blinkCount = 0;
    analysisOverlay.classList.remove('hidden');
}

async function completeScan() {
    isAnalyzing = true;
    updateProgress(100);
    
    finalBPM = calculateBPM(pulseSamples);
    finalRespiration = calculateRespiration(respirationSamples);
    finalBlinks = Math.round((blinkCount / (SCAN_DURATION / 1000)) * 60);
    finalHRV = calculateHRV(pulseSamples);
    
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
                biometrics: {
                    bpm: finalBPM,
                    respiration: finalRespiration,
                    blinkRate: finalBlinks,
                    hrv: finalHRV
                }
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
    if (samples.length < 20) return 72;
    let peaks = 0;
    const filtered = detrend(samples.map(s => s.g));
    for (let i = 1; i < filtered.length - 1; i++) {
        if (filtered[i] > filtered[i-1] && filtered[i] > filtered[i+1]) peaks++;
    }
    const bpm = Math.round((peaks / (SCAN_DURATION / 1000)) * 60);
    return Math.min(Math.max(bpm, 50), 110);
}

function calculateRespiration(samples) {
    if (samples.length < 50) return 16;
    let crossings = 0;
    const yVals = samples.map(s => s.y);
    const mean = yVals.reduce((a, b) => a + b) / yVals.length;
    for (let i = 1; i < yVals.length; i++) {
        if ((yVals[i-1] < mean && yVals[i] >= mean) || (yVals[i-1] > mean && yVals[i] <= mean)) crossings++;
    }
    return Math.round((crossings / 2 / (SCAN_DURATION / 1000)) * 60);
}

function calculateHRV(samples) {
    const filtered = detrend(samples.map(s => s.g));
    const peakTimes = [];
    for (let i = 1; i < filtered.length - 1; i++) {
        if (filtered[i] > filtered[i-1] && filtered[i] > filtered[i+1]) peakTimes.push(samples[i].t);
    }
    if (peakTimes.length < 5) return 45;
    const intervals = [];
    for (let i = 1; i < peakTimes.length; i++) intervals.push(peakTimes[i] - peakTimes[i-1]);
    const mean = intervals.reduce((a, b) => a + b) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    return Math.round(Math.sqrt(variance));
}

function detrend(arr) {
    const windowSize = 5;
    const result = [];
    for (let i = windowSize; i < arr.length - windowSize; i++) {
        let avg = 0;
        for (let j = -windowSize; j <= windowSize; j++) avg += arr[i + j];
        result.push(arr[i] - (avg / (windowSize * 2 + 1)));
    }
    return result;
}

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
}

function showResults(data) {
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    scannerView.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsGrid.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'wellness-hero';
    hero.style.gridColumn = "1 / -1";
    hero.style.textAlign = "center";
    hero.style.padding = "2.5rem";
    hero.style.background = "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)";
    hero.style.borderRadius = "20px";
    hero.style.border = "1px solid rgba(255,255,255,0.1)";
    hero.style.marginBottom = "2rem";

    hero.innerHTML = `
        <div style="font-size: 0.7rem; letter-spacing: 4px; opacity: 0.6; margin-bottom: 15px;">OVERALL WELLNESS SCORE</div>
        <div style="font-size: 6rem; font-weight: 800; color: #fff; line-height: 1;">${data.wellnessIndex || '--'}</div>
        <div style="margin-top: 15px; font-size: 0.9rem; color: #55ff55; font-weight: 600;">
            SCAN COMPLETE: Performance within top ${100 - (data.percentile || 85)}% of your age group
        </div>
    `;
    resultsGrid.appendChild(hero);

    if (data.vitals) {
        const vitalsCard = createSectionCard("BIOMETRIC VITALS", "🫀");
        vitalsCard.innerHTML += `
            <div class="vital-item"><span>Heart Rate:</span> <span class="val">${data.vitals.heartRate.value} BPM</span></div>
            <div class="vital-item"><span>Respiration:</span> <span class="val">${data.vitals.respiration.value} br/m</span></div>
            <div class="vital-item"><span>Stress Score:</span> <span class="val">${data.vitals.stress.score}/100</span></div>
            <p style="font-size: 0.75rem; opacity: 0.6; margin-top: 10px;">${data.vitals.stress.observation}</p>
        `;
        resultsGrid.appendChild(vitalsCard);
    }

    if (data.dermatology) {
        const dermCard = createSectionCard("DERMATOLOGICAL MARKERS", "🧴");
        dermCard.innerHTML += `
            <div class="metric-row"><span>Skin Hydration:</span> ${createProgressBar(data.dermatology.hydration)}</div>
            <div class="metric-row"><span>UV Resistance:</span> ${createProgressBar(data.dermatology.uvDamage)}</div>
            <div class="metric-row"><span>Acne Index:</span> ${createProgressBar(100 - data.dermatology.acne)}</div>
            <div class="metric-row"><span>Age Elasticity:</span> ${createProgressBar(100 - data.dermatology.wrinkles)}</div>
        `;
        resultsGrid.appendChild(dermCard);
    }

    if (data.systemic && data.lifestyle) {
        const systemicCard = createSectionCard("SYSTEMIC SCREENING", "🩺");
        systemicCard.innerHTML += `
            <div class="vital-item"><span>Anemia Risk:</span> <span class="val">${data.systemic.anemiaRisk.level}</span></div>
            <div class="vital-item"><span>Jaundice Risk:</span> <span class="val">${data.systemic.jaundiceRisk.level}</span></div>
            <div class="vital-item"><span>Sleep Score:</span> <span class="val">${data.lifestyle.sleepQuality.score}/100</span></div>
        `;
        resultsGrid.appendChild(systemicCard);
    }

    if (data.archetype) {
        const archSection = document.createElement('div');
        archSection.style.gridColumn = "1 / -1";
        archSection.innerHTML = `
            <div class="archetype-card" style="--aura-color: ${data.archetype.aura || '#fff'}">
                <h4 style="font-size: 0.7rem; letter-spacing: 2px; opacity: 0.6;">DIVINE ARCHETYPE</h4>
                <h2 style="font-size: 2.2rem; margin: 10px 0;">${data.archetype.name}</h2>
                <p style="font-size: 0.85rem; opacity: 0.8;">${data.archetype.reason}</p>
            </div>
        `;
        resultsGrid.appendChild(archSection);
    }

    const footer = document.createElement('div');
    footer.style.gridColumn = "1 / -1";
    footer.style.textAlign = "center";
    footer.style.marginTop = "2rem";
    footer.appendChild(resetBtn);
    resultsGrid.appendChild(footer);
}

function createSectionCard(title, icon) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.background = "rgba(255,255,255,0.03)";
    card.style.padding = "1.5rem";
    card.style.borderRadius = "15px";
    card.style.border = "1px solid rgba(255,255,255,0.05)";
    card.innerHTML = `<h3 style="font-size: 0.7rem; letter-spacing: 2px; margin-bottom: 1rem;">${icon} ${title}</h3>`;
    return card;
}

function createProgressBar(score) {
    const color = score > 80 ? '#4caf50' : (score > 50 ? '#ff9800' : '#f44336');
    return `<div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 5px;"><div style="width: ${score}%; height: 100%; background: ${color};"></div></div>`;
}

function updateProgress(percent) {
    const rounded = Math.round(percent);
    progressPercent.textContent = `${rounded}%`;
    const offset = PROGRESS_MAX - (rounded / 100 * PROGRESS_MAX);
    progressCircle.style.strokeDashoffset = offset;
}

function resetScanner() {
    isAnalyzing = false;
    resultsSection.classList.add('hidden');
    scannerView.classList.remove('hidden');
    analysisOverlay.classList.add('hidden');
    updateProgress(0);
    scanStartTime = 0;
}

startBtn.addEventListener('click', startVideo);
resetBtn.addEventListener('click', resetScanner);
