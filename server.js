const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads (store in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// API proxy endpoint for OCR
app.post('/api/ocr', upload.single('file'), async (req, res) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload an image file'
            });
        }

        // Check if API key is configured
        if (!process.env.OPTIIC_API_KEY) {
            return res.status(500).json({
                error: 'API key not configured',
                message: 'Please add OPTIIC_API_KEY to your .env file'
            });
        }

        console.log('Processing OCR request for file:', req.file.originalname);
        console.log('File size:', req.file.size, 'bytes');

        // Create form data for Optiic API
        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });
        // Optiic API expects apiKey as a form field, not in Authorization header
        formData.append('apiKey', process.env.OPTIIC_API_KEY);

        // Make request to Optiic API
        const response = await axios.post('https://api.optiic.dev/process', formData, {
            headers: {
                ...formData.getHeaders()
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('Optiic API response received');

        // Forward the response to the client
        res.json(response.data);

    } catch (error) {
        console.error('OCR Error:', error.message);

        if (error.response) {
            // API returned an error response
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', error.response.data);

            res.status(error.response.status).json({
                error: 'API Error',
                message: error.response.data.message || error.response.data.error || 'OCR processing failed',
                details: error.response.data
            });
        } else if (error.request) {
            // Request was made but no response received
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Could not reach Optiic API. Please check your internet connection.'
            });
        } else {
            // Something else went wrong
            res.status(500).json({
                error: 'Server Error',
                message: error.message || 'An unexpected error occurred'
            });
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        apiKeyConfigured: !!process.env.OPTIIC_API_KEY,
        timestamp: new Date().toISOString()
    });
});

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Optiic OCR Application Server           ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║   Server running on: http://localhost:${PORT.toString().padEnd(4)} ║`);
    console.log(`║   API Key configured: ${(process.env.OPTIIC_API_KEY ? 'Yes ✓' : 'No  ✗').padEnd(18)}║`);
    console.log('╚════════════════════════════════════════════╝');
    console.log('\nPress Ctrl+C to stop the server\n');
});
