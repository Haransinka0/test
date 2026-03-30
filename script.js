// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadContent = document.getElementById('uploadContent');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const removeBtn = document.getElementById('removeBtn');
const extractBtn = document.getElementById('extractBtn');
const loadingState = document.getElementById('loadingState');
const resultsArea = document.getElementById('resultsArea');
const resultsContent = document.getElementById('resultsContent');
const resultsMeta = document.getElementById('resultsMeta');
const copyBtn = document.getElementById('copyBtn');

let selectedFile = null;

// Upload Area Click Handler
uploadArea.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !removeBtn.contains(e.target)) {
        fileInput.click();
    }
});

// File Input Change Handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Drag and Drop Handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    } else {
        showError('Please drop a valid image file');
    }
});

// Handle File Selection
function handleFile(file) {
    // Validate file type - check MIME type or file extension
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif'];
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    // Check if file type starts with 'image/' OR has valid extension
    const isValidType = file.type.startsWith('image/') || validExtensions.includes(fileExtension);

    if (!isValidType) {
        showError('Invalid file type. Please upload an image file (JPG, PNG, WEBP, BMP, GIF, TIFF).');
        return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showError('File size too large. Maximum size is 10MB.');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        uploadContent.style.display = 'none';
        previewContainer.style.display = 'block';
        extractBtn.disabled = false;

        // Hide results if showing
        resultsArea.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// Remove Button Handler
removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
});

// Reset Upload State
function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    uploadContent.style.display = 'block';
    previewContainer.style.display = 'none';
    extractBtn.disabled = true;
    resultsArea.style.display = 'none';
}

// Extract Button Handler
extractBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Show loading state
    extractBtn.style.display = 'none';
    loadingState.style.display = 'block';
    resultsArea.style.display = 'none';

    try {
        // Create FormData
        const formData = new FormData();
        formData.append('file', selectedFile);

        // Make API request to local proxy server
        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Process and display results
        displayResults(data);

    } catch (error) {
        console.error('OCR Error:', error);
        showError(`Failed to extract text: ${error.message}`);
    } finally {
        // Hide loading state
        loadingState.style.display = 'none';
        extractBtn.style.display = 'flex';
    }
});

// Display Results
function displayResults(data) {
    // Extract structured field data from response
    let fields = [];
    let extractedText = '';

    // Handle different response formats
    if (data.result && Array.isArray(data.result)) {
        // Format 1: { result: [[bbox, text, confidence], ...] }
        fields = data.result.map((item, index) => {
            if (Array.isArray(item)) {
                return {
                    fieldNumber: index + 1,
                    bbox: item[0] || null,
                    text: item[1] || '',
                    confidence: item[2] || null
                };
            }
            return {
                fieldNumber: index + 1,
                text: item,
                bbox: null,
                confidence: null
            };
        });
    } else if (data.predictions && Array.isArray(data.predictions)) {
        // Format 2: { predictions: [...] }
        fields = data.predictions.map((item, index) => ({
            fieldNumber: index + 1,
            text: item.text || item,
            bbox: item.bbox || item.bounding_box || null,
            confidence: item.confidence || item.score || null
        }));
    } else if (Array.isArray(data)) {
        // Format 3: Direct array
        fields = data.map((item, index) => {
            if (Array.isArray(item)) {
                return {
                    fieldNumber: index + 1,
                    bbox: item[0] || null,
                    text: item[1] || '',
                    confidence: item[2] || null
                };
            }
            return {
                fieldNumber: index + 1,
                text: typeof item === 'string' ? item : (item.text || ''),
                bbox: item.bbox || item.bounding_box || null,
                confidence: item.confidence || item.score || null
            };
        });
    } else if (data.text) {
        // Format 4: Simple text response
        fields = [{
            fieldNumber: 1,
            text: data.text,
            bbox: null,
            confidence: null
        }];
    }

    // Display structured field information
    if (fields.length > 0) {
        // Build the HTML for field cards
        let fieldsHTML = '<div class="fields-container">';

        fields.forEach(field => {
            fieldsHTML += `
                <div class="field-card">
                    <div class="field-header">
                        <span class="field-label">Field ${field.fieldNumber}</span>
                        ${field.confidence !== null ? `<span class="field-confidence">${(field.confidence * 100).toFixed(1)}% confidence</span>` : ''}
                    </div>
                    <div class="field-text">${escapeHtml(field.text)}</div>
                    ${field.bbox ? `
                        <div class="field-details">
                            <strong>Position:</strong> 
                            <span class="bbox-info">${formatBbox(field.bbox)}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        fieldsHTML += '</div>';

        resultsContent.innerHTML = fieldsHTML;

        // Collect all text for metadata
        extractedText = fields.map(f => f.text).join('\n');
        const wordCount = extractedText.trim().split(/\s+/).length;
        const charCount = extractedText.length;

        resultsMeta.innerHTML = `
            <div class="meta-item">
                <strong>Total Fields:</strong> ${fields.length}
            </div>
            <div class="meta-item">
                <strong>Characters:</strong> ${charCount.toLocaleString()}
            </div>
            <div class="meta-item">
                <strong>Words:</strong> ${wordCount.toLocaleString()}
            </div>
        `;

        resultsArea.style.display = 'block';

        // Smooth scroll to results
        setTimeout(() => {
            resultsArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    } else {
        showError('No text detected in the image. Please try another image.');
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to format bounding box coordinates
function formatBbox(bbox) {
    if (!bbox) return 'N/A';

    if (Array.isArray(bbox)) {
        if (bbox.length === 4 && typeof bbox[0] === 'number') {
            // Format: [x, y, width, height]
            return `(${bbox[0]}, ${bbox[1]}) - ${bbox[2]}×${bbox[3]}`;
        } else if (Array.isArray(bbox[0])) {
            // Format: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            const points = bbox.map(p => `(${Math.round(p[0])},${Math.round(p[1])})`).join(' ');
            return points;
        }
    }

    return JSON.stringify(bbox);
}

// Copy Button Handler
copyBtn.addEventListener('click', async () => {
    const text = resultsContent.textContent;

    try {
        await navigator.clipboard.writeText(text);

        // Update button state
        const originalHTML = copyBtn.innerHTML;
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9l4 4L15 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Copied!</span>
        `;

        // Reset after 2 seconds
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = originalHTML;
        }, 2000);

    } catch (error) {
        console.error('Copy failed:', error);
        showError('Failed to copy text to clipboard');
    }
});

// Show Error Message
function showError(message) {
    // Remove existing error if any
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;

    // Insert after upload area
    uploadArea.parentNode.insertBefore(errorDiv, uploadArea.nextSibling);

    // Auto remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add fade out animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);
