document.getElementById('imageUpload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const previewSection = document.getElementById('previewSection');
    const imagePreview = document.getElementById('imagePreview');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultsSection = document.getElementById('resultsSection');
    const resultsGrid = document.getElementById('resultsGrid');

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        previewSection.classList.remove('hidden');
        loadingOverlay.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        resultsGrid.innerHTML = '';
    };
    reader.readAsDataURL(file);

    // Prepare data for API
    const imageBase64 = await toBase64(file);
    const mimeType = file.type;

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                imageBase64: imageBase64.split(',')[1],
                mimeType: mimeType,
            }),
        });

        const result = await response.json();
        displayResults(result);
    } catch (error) {
        console.error('Error analyzing image:', error);
        alert('Failed to analyze image. Please try again.');
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
}

function displayResults(data) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsGrid = document.getElementById('resultsGrid');
    resultsGrid.innerHTML = '';

    const keys = {
        stressLevel: '🧠 Stress Level',
        tiredness: '😴 Tiredness',
        estimatedAge: '🎂 Estimated Age',
        skinObservations: '✨ Skin Observations',
        fatigueSigns: '📉 Fatigue Signs',
        lifestyleHabits: '🧘 Lifestyle Habits'
    };

    let foundAny = false;
    for (const [key, label] of Object.entries(keys)) {
        if (data[key]) {
            foundAny = true;
            const card = document.createElement('div');
            card.className = 'result-card';
            
            const h3 = document.createElement('h3');
            h3.textContent = label;
            
            const p = document.createElement('p');
            p.textContent = data[key];
            
            card.appendChild(h3);
            card.appendChild(p);
            resultsGrid.appendChild(card);
        }
    }

    if (!foundAny && data.raw) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.gridColumn = '1 / -1';
        
        const h3 = document.createElement('h3');
        h3.textContent = 'Analysis Result';
        
        const p = document.createElement('p');
        p.textContent = data.raw;
        
        card.appendChild(h3);
        card.appendChild(p);
        resultsGrid.appendChild(card);
    } else if (!foundAny) {
        resultsGrid.innerHTML = '<p>No specific results found. Please try another image.</p>';
    }

    resultsSection.classList.remove('hidden');
}
