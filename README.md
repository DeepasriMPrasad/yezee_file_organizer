Yezee File Organizer - Build & Setup Guide
This document provides instructions on how to set up the necessary dependencies to run and build the Yezee File Organizer application.

Part 1: Running in Development Mode
This is the simplest way to run the application on your machine for testing or personal use.

Requirements
Python 3.6+: Ensure you have Python installed on your system. You can download it from python.org.

Installation Steps
Navigate to Project Directory: Open your terminal or command prompt and navigate to the root directory of the Yezee File Organizer project (the folder containing app.py).

Create a Virtual Environment (Recommended): This step is optional but highly recommended to keep project dependencies isolated.

python -m venv venv

Activate the virtual environment:

On Windows: venv\\Scripts\\activate

On macOS/Linux: source venv/bin/activate

Install Dependencies: Use pip and the provided requirements.txt file to install all necessary Python libraries.

pip install -r requirements.txt

Running the Application
Once the dependencies are installed, you can start the application with a single command:

python app.py

Your default web browser should automatically open to the application's interface. If not, you can manually navigate to the URL shown in the terminal (usually http://127.0.0.1:5050).

Part 2: Building a Standalone Executable
This process will bundle the entire application (Python server and frontend files) into a single .exe file (on Windows) or a standalone executable (on macOS/Linux) that can be run on other computers without needing to install Python or any dependencies.

Additional Requirement
PyInstaller: This tool is used to create the executable.

Installation
Install PyInstaller using pip:

pip install pyinstaller

Build Command
Navigate to the Root Directory: Make sure your terminal is in the project's root directory.

Run the PyInstaller Command: Execute the following command. It tells PyInstaller to create a single, windowless executable and to include all the necessary frontend files.

On Windows:

pyinstaller --onefile --windowed --add-data "index.html;." --add-data "script.js;." --add-data "style.css;." --add-data "content.json;." app.py

On macOS/Linux:

pyinstaller --onefile --windowed --add-data "index.html:." --add-data "script.js:." --add-data "style.css:." --add-data "content.json:." app.py

Note: The separator for --add-data is a semicolon (;) on Windows and a colon (:) on macOS/Linux.

Find Your Executable
After the build process completes, you will find a dist folder in your project directory. Inside this folder is your standalone application (e.g., app.exe or app). You can move this file to any location or share it with others.