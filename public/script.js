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
        statusText.textContent = "BIOSCAN ACTIVE";
        const landmarks = results.multiFaceLandmarks[0];
        drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C040', lineWidth: 0.5});
        if (scanStartTime > 0) {
            const now = Date.now();
            const elapsed = now - scanStartTime;
            if (elapsed < SCAN_DURATION) {
                pulseSamples.push({ t: elapsed, g: getForeheadGreen(landmarks, video) });
                respirationSamples.push({ t: elapsed, y: landmarks[1].y });
                detectBlink(landmarks);
                updateProgress((elapsed / SCAN_DURATION) * 100);
            } else {
                completeScan();
            }
        } else {
            startPulseScan();
        }
    } else {
        statusText.textContent = "ALIGN FACE...";
        scanStartTime = 0;
    }
}

function detectBlink(landmarks) {
    const dist = Math.abs(landmarks[159].y - landmarks[145].y);
    if (dist < 0.015) {
        if (!eyeClosed) { eyeClosed = true; blinkCount++; }
    } else { eyeClosed = false; }
}

function getForeheadGreen(landmarks, video) {
    const tC = document.createElement('canvas');
    const tCtx = tC.getContext('2d');
    tC.width = 40; tC.height = 40;
    const fx = landmarks[151].x * video.videoWidth;
    const fy = landmarks[151].y * video.videoHeight;
    tCtx.drawImage(video, fx - 20, fy - 20, 40, 40, 0, 0, 40, 40);
    const d = tCtx.getImageData(0, 0, 40, 40).data;
    let s = 0;
    for (let i = 1; i < d.length; i += 4) s += d[i];
    return s / (d.length / 4);
}

function startPulseScan() {
    scanStartTime = Date.now();
    pulseSamples = []; respirationSamples = []; blinkCount = 0;
    analysisOverlay.classList.remove('hidden');
}

async function completeScan() {
    isAnalyzing = true;
    updateProgress(100);
    
    const bpm = calculateBPM(pulseSamples);
    const resp = calculateRespiration(respirationSamples);
    const blinks = Math.round((blinkCount / (SCAN_DURATION / 1000)) * 60);
    
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
                biometrics: { bpm, respiration: resp, blinkRate: blinks }
            })
        });
        const result = await response.json();
        showResults(result);
    } catch (err) {
        console.error("Scan failed", err);
        resetScanner();
    }
}

function calculateBPM(samples) {
    if (samples.length < 20) return 72;
    let p = 0; const f = detrend(samples.map(s => s.g));
    for (let i = 1; i < f.length - 1; i++) if (f[i] > f[i-1] && f[i] > f[i+1]) p++;
    return Math.min(Math.max(Math.round((p / (SCAN_DURATION / 1000)) * 60), 55), 105);
}

function calculateRespiration(samples) {
    if (samples.length < 50) return 16;
    let c = 0; const y = samples.map(s => s.y);
    const m = y.reduce((a, b) => a + b) / y.length;
    for (let i = 1; i < y.length; i++) if ((y[i-1] < m && y[i] >= m) || (y[i-1] > m && y[i] <= m)) c++;
    return Math.round((c / 2 / (SCAN_DURATION / 1000)) * 60);
}

function detrend(arr) {
    const w = 5; const res = [];
    for (let i = w; i < arr.length - w; i++) {
        let a = 0; for (let j = -w; j <= w; j++) a += arr[i + j];
        res.push(arr[i] - (a / (w * 2 + 1)));
    }
    return res;
}

function showResults(data) {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }

    scannerView.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsGrid.innerHTML = '';

    // Hero Section
    const hero = document.createElement('div');
    hero.className = 'wellness-hero';
    hero.style.gridColumn = "1 / -1";
    hero.innerHTML = `
        <h5 style="letter-spacing: 5px; opacity: 0.6; font-size: 0.7rem; margin-bottom: 20px;">BIO-WELLNESS INDEX</h5>
        <h1 style="font-size: 7rem; font-weight: 800; line-height: 1;">${data.wellnessIndex || '--'}</h1>
        <p style="margin-top: 20px; color: #55ff55; font-size: 0.9rem; font-weight: 600;">
            TOP ${100 - (data.percentile || 85)}% OF YOUR AGE GROUP
        </p>
    `;
    resultsGrid.appendChild(hero);

    // Vitals Card
    const vitalsCard = createCard("BIOMETRICS", "⚡");
    vitalsCard.innerHTML += `
        <div class="vital-item"><span>HEART RATE</span> <span class="val">${data.vitals.heartRate.value} BPM</span></div>
        <div class="vital-item"><span>RESPIRATION</span> <span class="val">${data.vitals.respiration.value} br/m</span></div>
        <div class="vital-item"><span>STRESS SCORE</span> <span class="val">${data.vitals.stress.score}/100</span></div>
        <p style="font-size: 0.7rem; margin-top: 15px; line-height: 1.5; opacity: 0.6;">${data.vitals.stress.observation}</p>
    `;
    resultsGrid.appendChild(vitalsCard);

    // Dermatology Card
    const dermCard = createCard("DERMATOLOGY", "🩺");
    dermCard.innerHTML += `
        ${createMetric("Skin Hydration", data.dermatology.hydration)}
        ${createMetric("UV Resistance", data.dermatology.uvDamage)}
        ${createMetric("Pore Quality", data.dermatology.poreSize || 80)}
        ${createMetric("Acne Defense", 100 - data.dermatology.acne)}
    `;
    resultsGrid.appendChild(dermCard);

    // Systemic Card
    const systemicCard = createCard("SYSTEMIC SCAN", "🩸");
    systemicCard.innerHTML += `
        <div class="vital-item"><span>ANEMIA RISK</span> <span class="val">${data.systemic.anemiaRisk.level}</span></div>
        <div class="vital-item"><span>JAUNDICE RISK</span> <span class="val">${data.systemic.jaundiceRisk.level}</span></div>
        <div class="vital-item"><span>SLEEP SCORE</span> <span class="val">${data.lifestyle.sleepQuality.score}/100</span></div>
        <p style="font-size: 0.7rem; margin-top: 15px; opacity: 0.6;">INFERRED BIOLOGICAL AGE: ${data.age.biologicalAge}</p>
    `;
    resultsGrid.appendChild(systemicCard);

    // Archetype Card
    if (data.archetype) {
        const icons = { 'Arjuna': '🏹', 'Bhima': '🔨', 'Karna': '🛡️', 'Krishna': '🪈', 'Vidura': '📜', 'Rama': '👑', 'Hanuman': '📿', 'Draupadi': '🔥' };
        const archeCard = document.createElement('div');
        archeCard.className = 'archetype-card';
        archeCard.style.setProperty('--aura-color', data.archetype.aura || '#fff');
        archeCard.innerHTML = `
            <div class="char-icon-large">${icons[data.archetype.name.trim()] || '🔱'}</div>
            <div class="archetype-info">
                <h5 style="letter-spacing: 5px; opacity: 0.6; font-size: 0.6rem; margin-bottom: 10px;">DIVINE ARCHETYPE</h5>
                <h2>${data.archetype.name}</h2>
                <p style="line-height: 1.6; opacity: 0.8; font-size: 0.9rem;">${data.archetype.reason}</p>
            </div>
        `;
        resultsGrid.appendChild(archeCard);
    }

    // Secret Tip
    if (data.secretTip) {
        const tipPanel = document.createElement('div');
        tipPanel.className = 'secret-tip-panel';
        tipPanel.innerHTML = `<h5>ANCIENT SECRET</h5><p>"${data.secretTip.tip}"</p>`;
        resultsGrid.appendChild(tipPanel);
    }

    // Reset Button
    const foot = document.createElement('div');
    foot.style.gridColumn = "1 / -1"; foot.style.marginTop = "3rem";
    foot.appendChild(resetBtn);
    resultsGrid.appendChild(foot);
}

function createCard(title, icon) {
    const c = document.createElement('div');
    c.className = 'result-card';
    c.innerHTML = `<h3><span>${icon}</span> ${title}</h3>`;
    return c;
}

function createMetric(label, score) {
    const color = score > 80 ? '#4caf50' : (score > 60 ? '#ff9800' : '#f44336');
    return `
        <div class="metric-row">
            <div class="metric-label"><span>${label}</span> <span>${score}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width: ${score}%; background: ${color};"></div></div>
        </div>
    `;
}

function updateProgress(percent) {
    const rounded = Math.round(percent);
    progressPercent.textContent = `${rounded}%`;
    progressCircle.style.strokeDashoffset = PROGRESS_MAX - (rounded / 100 * PROGRESS_MAX);
}

function resetScanner() {
    isAnalyzing = false;
    resultsSection.classList.add('hidden');
    scannerView.classList.remove('hidden');
    analysisOverlay.classList.add('hidden');
    updateProgress(0);
    scanStartTime = 0;
}

startBtn.addEventListener('click', () => {
    new Camera(video, { onFrame: async () => { await faceMesh.send({image: video}); }, width: 1280, height: 720 }).start();
    setupView.classList.add('hidden');
    scannerView.classList.remove('hidden');
});

resetBtn.addEventListener('click', resetScanner);
