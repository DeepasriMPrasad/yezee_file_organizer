Easy File Organizer - Project Structure
For the application to run correctly, you should organize the files you have into the following structure. Create a main folder for the project (e.g., easy-file-organizer) and place the files inside it as shown below.
Directory Layout
easy-file-organizer/
│
├── app.py              # The main application file. You run this to start the server.
│
├── organizer_logic.py  # Contains all the core logic for file operations.
│
├── index.html          # The front-end user interface that you see in the browser.
│
└── readme.md           # The instructions file.


File Descriptions
app.py:
This is the heart of the application.
It uses the Flask framework to create a lightweight web server.
It serves the index.html file to your browser.
It provides the API endpoints (/api/select-folder, /api/scan-folder, /api/organize) that the front-end uses to communicate with the Python backend.
This is the only file you need to execute to start the entire program.
organizer_logic.py:
This file is a "helper" module for app.py.
It contains all the functions that actually interact with your file system: scanning directories, checking files against rules, categorizing files, and performing the move/copy operations.
Separating this logic from app.py makes the code cleaner and easier to maintain.
index.html:
This is the visual part of the application.
It contains all the HTML for the layout, the CSS (via Tailwind) for styling, and the JavaScript for interactivity.
The JavaScript in this file is responsible for handling user actions (like button clicks), building the organization preview, and making API calls to app.py to get data or trigger actions.
How They Work Together
You run python app.py.
app.py starts a web server and opens index.html in your browser.
When you click "Select Folder" in index.html, its JavaScript sends a request to the /api/select-folder endpoint in app.py.
app.py then runs the Python code to open a native file dialog on your computer.
After you select a folder, the path is sent back to index.html, which then requests a scan via the /api/scan-folder endpoint.
app.py calls functions from organizer_logic.py to perform the scan and sends the file list back.
Finally, when you click "Organize," index.html sends all your rules and settings to the /api/organize endpoint, and app.py uses organizer_logic.py to carry out the file operations.
