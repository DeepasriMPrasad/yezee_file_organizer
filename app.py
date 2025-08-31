import os
import sys
import webbrowser
from flask import Flask, request, jsonify, send_from_directory
from tkinter import Tk, filedialog
import organizer_logic
import logging
from logging.handlers import RotatingFileHandler
import json
from datetime import datetime

# --- Configure Logging ---
# Creates a new log file each time the application starts
#log_filename = f"yezee_file_organizer_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
log_filename = f"yezee_file_organizer.log"
max_log_size = 3 * 1024 * 1024  # 3 MB
backup_count = 2  # Number of backup log files to keep

file_handler = RotatingFileHandler(
    log_filename, maxBytes=max_log_size, backupCount=backup_count, encoding='utf-8'
)
stream_handler = logging.StreamHandler(sys.stdout)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[file_handler, stream_handler] # Also print logs to the console
    )
logger = logging.getLogger(__name__)

# Hide Werkzeug's default console output
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.setLevel(logging.ERROR)

# --- Determine Application Path (for running as script or as bundled .exe) ---
if getattr(sys, 'frozen', False):
    # The application is frozen (packaged with PyInstaller)
    base_dir = sys._MEIPASS
else:
    # The application is running in a normal Python environment
    base_dir = os.path.dirname(os.path.abspath(__file__))

# Set the static folder path for Flask to serve files like index.html, script.js etc.
static_folder_path = os.path.join(base_dir)
app = Flask(__name__, static_folder=static_folder_path, static_url_path='')


# --- API Endpoints ---

@app.route('/')
def index():
    """Serves the main HTML file."""
    return send_from_directory(static_folder_path, 'index.html')

@app.route('/api/get-content', methods=['GET'])
def get_content():
    """Serves the configurable content for modals from content.json."""
    try:
        content_path = os.path.join(base_dir, 'content.json')
        with open(content_path, 'r', encoding='utf-8') as f:
            content = json.load(f)
        return jsonify({"success": True, "data": content})
    except Exception as e:
        logger.error(f"Failed to read content.json: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/check-dependencies', methods=['GET'])
def check_dependencies():
    """Checks for optional libraries and informs the frontend."""
    try:
        dependencies = organizer_logic.get_dependency_status()
        return jsonify({"success": True, "dependencies": dependencies})
    except Exception as e:
        logger.error(f"Failed to check dependencies: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/select-folder', methods=['POST'])
def select_folder():
    """Opens a native OS dialog for the user to select a folder."""
    logger.info("Received request to select a folder.")
    try:
        root = Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder_path = filedialog.askdirectory(title="Select Folder")
        root.destroy()

        if folder_path:
            logger.info(f"Folder selected: {folder_path}")
            return jsonify({"success": True, "path": folder_path})
        else:
            logger.warning("Folder selection was cancelled.")
            return jsonify({"success": False, "error": "No folder selected."})
    except Exception as e:
        logger.error(f"Failed to open folder dialog: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/scan-folder', methods=['POST'])
def scan_folder():
    """Scans the selected folder for files, including metadata."""
    data = request.get_json()
    folder_path = data.get('path')
    depth = data.get('subfolderDepth', 0)
    logger.info(f"Scanning folder: '{folder_path}' with depth {depth}.")

    if not folder_path or not os.path.isdir(folder_path):
        logger.error(f"Invalid folder path provided: '{folder_path}'.")
        return jsonify({"success": False, "error": "Invalid folder path."}), 400
    try:
        files = organizer_logic.scan_directory_for_files(folder_path, depth)
        logger.info(f"Scan successful, found {len(files)} file(s).")
        return jsonify({"success": True, "files": files})
    except Exception as e:
        logger.error(f"Error during folder scan: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/find-duplicates', methods=['POST'])
def find_duplicates():
    """Identifies duplicate files from a provided list."""
    data = request.get_json()
    files_list = data.get('files')
    logger.info(f"Finding duplicates in a list of {len(files_list)} files.")
    if not isinstance(files_list, list):
        return jsonify({"success": False, "error": "Invalid data format; 'files' must be a list."}), 400
    try:
        files_with_duplicates = organizer_logic.identify_duplicates(files_list)
        return jsonify({"success": True, "files": files_with_duplicates})
    except Exception as e:
        logger.error(f"Error during duplicate search: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/preview-organization', methods=['POST'])
def preview_organization():
    """Generates a preview of the organization structure without moving files."""
    config = request.get_json()
    if not config:
        return jsonify({"success": False, "error": "Invalid configuration."}), 400
    try:
        tree = organizer_logic.generate_preview_structure(config)
        return jsonify({"success": True, "tree": tree})
    except Exception as e:
        logger.error(f"Error during preview generation: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/organize', methods=['POST'])
def organize_files():
    """Executes the file organization plan."""
    config = request.get_json()
    if not config:
        logger.error("Organize request failed: No configuration provided.")
        return jsonify({"success": False, "error": "Invalid configuration."}), 400
    try:
        log_from_logic, undo_log = organizer_logic.execute_organization_plan(config)
        logger.info("Organization plan executed successfully.")
        return jsonify({"success": True, "log": log_from_logic, "undo_log": undo_log})
    except Exception as e:
        logger.error(f"Error during organization: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/undo', methods=['POST'])
def undo_organization():
    """Executes an undo plan."""
    data = request.get_json()
    undo_actions = data.get('undo_log')
    target_dir = data.get('targetDirectory')
    logger.info("Received request to undo the last organization.")
    if not isinstance(undo_actions, list) or not target_dir:
        return jsonify({"success": False, "error": "Invalid undo data provided."}), 400
    try:
        log_from_logic = organizer_logic.execute_undo(undo_actions, target_dir)
        logger.info("Undo operation executed successfully.")
        return jsonify({"success": True, "log": log_from_logic})
    except Exception as e:
        logger.error(f"Error during undo operation: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

# --- Main Execution ---
def main():
    port = 5050
    url = f"http://127.0.0.1:{port}"
    print(f" * Starting Yezee File Organizer...")
    print(f" * Activity Log: '{log_filename}'")
    print(f" * Open this URL in your browser: {url}")
    logger.info("==========================================================")
    logger.info("Yezee File Organizer application started.")
    logger.info(f"Serving UI at {url}")
    webbrowser.open(url)
    app.run(host='127.0.0.1', port=port, debug=False)

if __name__ == '__main__':
    main()

