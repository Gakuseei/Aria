"""
Zonos API Server for Aria
Provides REST API endpoint /api/tts for text-to-speech generation
"""

import os
import sys
import subprocess

# Set up espeak-ng environment BEFORE importing zonos
def setup_espeak_environment():
    """Configure espeak-ng paths for Windows"""
    try:
        # Try to find espeak-ng installation
        result = subprocess.run(
            ['where', 'espeak-ng'],
            capture_output=True,
            text=True,
            shell=True
        )
        if result.returncode == 0:
            espeak_path = result.stdout.strip().split('\n')[0]
            espeak_dir = os.path.dirname(espeak_path)
            
            # Set environment variables
            os.environ['ESPEAK_DATA_PATH'] = os.path.join(espeak_dir, '..', 'share', 'espeak-ng-data')
            os.environ['PATH'] = espeak_dir + os.pathsep + os.environ.get('PATH', '')
            
            # Also set for phonemizer backend
            os.environ['PHONEMIZER_ESPEAK_PATH'] = espeak_path
            os.environ['PHONEMIZER_ESPEAK_DATA_PATH'] = os.environ['ESPEAK_DATA_PATH']
            
            print(f"[Zonos API] espeak-ng found: {espeak_path}")
            print(f"[Zonos API] ESPEAK_DATA_PATH: {os.environ['ESPEAK_DATA_PATH']}")
    except Exception as e:
        print(f"[Zonos API] Warning: Could not auto-configure espeak: {e}")

# Run setup before any other imports
setup_espeak_environment()

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch
import torchaudio
import io
import tempfile
from pathlib import Path

# Import zonos AFTER environment setup
try:
    from zonos.model import Zonos
    from zonos.conditioning import make_cond_dict
    from zonos.utils import DEFAULT_DEVICE as device
except ImportError as e:
    print(f"[Zonos API] ERROR: Failed to import Zonos: {e}")
    print("[Zonos API] Make sure you're running from the Zonos directory with venv activated")
    sys.exit(1)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global model instance
MODEL = None
MODEL_TYPE = "Zyphra/Zonos-v0.1-transformer"


def load_model():
    """Load the Zonos model"""
    global MODEL
    if MODEL is None:
        print(f"[Zonos API] Loading model: {MODEL_TYPE}")
        try:
            MODEL = Zonos.from_pretrained(MODEL_TYPE, device=device)
            MODEL.requires_grad_(False).eval()
            print("[Zonos API] Model loaded successfully!")
        except Exception as e:
            print(f"[Zonos API] ERROR loading model: {e}")
            raise
    return MODEL


@app.route("/api/tts", methods=["POST"])
def text_to_speech():
    """
    Generate speech from text
    Expected JSON body: {"text": "Hello world", "language": "en-us"}
    Returns: Audio file (WAV format)
    """
    try:
        data = request.get_json()

        if not data or "text" not in data:
            return jsonify({"error": "Missing 'text' field in request body"}), 400

        text = data.get("text", "")
        language = data.get("language", "en-us")

        if not text.strip():
            return jsonify({"error": "Text cannot be empty"}), 400

        print(f"[Zonos API] Generating speech for: '{text[:50]}...' (lang: {language})")

        # Load model if not already loaded
        model = load_model()

        # Generate speech
        torch.manual_seed(421)  # For reproducibility

        cond_dict = make_cond_dict(text=text, language=language)
        conditioning = model.prepare_conditioning(cond_dict)

        codes = model.generate(conditioning)
        wavs = model.autoencoder.decode(codes).cpu()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            temp_path = tmp_file.name

        torchaudio.save(temp_path, wavs[0], model.autoencoder.sampling_rate)

        # Read the file and return it
        response = send_file(
            temp_path,
            mimetype="audio/wav",
            as_attachment=False,
            download_name="speech.wav",
        )

        # Clean up temp file after sending
        @response.call_on_close
        def cleanup():
            try:
                os.unlink(temp_path)
            except:
                pass

        return response

    except Exception as e:
        error_msg = str(e)
        print(f"[Zonos API] Error: {error_msg}")
        
        # Provide helpful error messages for common issues
        if "espeak" in error_msg.lower():
            return jsonify({
                "error": "espeak-ng not found. Please restart your computer and try again.",
                "details": error_msg
            }), 500
        
        return jsonify({"error": error_msg}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    espeak_ok = False
    try:
        subprocess.run(['espeak-ng', '--version'], capture_output=True, check=True)
        espeak_ok = True
    except:
        pass
    
    return jsonify({
        "status": "healthy",
        "model": MODEL_TYPE,
        "model_loaded": MODEL is not None,
        "espeak_available": espeak_ok
    })


@app.route("/", methods=["GET"])
def root():
    """Root endpoint"""
    return jsonify({
        "service": "Zonos API Server for Aria",
        "version": "1.0.0",
        "endpoints": {
            "/api/tts": "POST - Generate speech from text",
            "/api/health": "GET - Health check",
        },
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  Zonos API Server for Aria")
    print("=" * 60)
    print("[INFO] Starting server on http://0.0.0.0:7860")
    print("[INFO] Endpoints:")
    print("       POST /api/tts - Generate speech")
    print("       GET  /api/health - Health check")
    print("=" * 60)

    # Pre-load model on startup
    try:
        load_model()
    except Exception as e:
        print(f"[WARNING] Failed to pre-load model: {e}")
        print("[INFO] Model will be loaded on first request")

    # Run the Flask app
    app.run(host="0.0.0.0", port=7860, threaded=True)
