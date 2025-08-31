document.addEventListener('DOMContentLoaded', () => {
    // State
    let state = {
        sourceFolderPath: null,
        copyDestinationPath: null,
        allFiles: [],
        filteredFiles: [],
        rules: [],
        ruleOperator: 'OR',
        organizeByPrimary: 'type',
        organizeBySecondary: 'none',
        organizationOptions: {
            files_per_folder: 100,
            first_n_chars: 3,
            folderPrefix: '',
            folderSuffix: '',
            filenamePrefix: '',
            filenameSuffix: '',
            filenameIncrementalPrefix: false,
            filenameIncrementalSuffix: false
        },
        operation: 'copy',
        deleteEmptyFolders: false,
        subfolderDepth: 0,
        theme: 'dark',
        duplicatesScanned: false,
        duplicatesFromCache: false,
        lastUndoLog: null
    };

    let modalContentData = null; // Holds content for Help/About modals

    // DOM Elements
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const sourcePath = document.getElementById('sourcePath');
    const sourceTooltip = document.getElementById('sourceTooltip');
    const copyDestWrapper = document.getElementById('copy-destination-wrapper');
    const selectCopyDestBtn = document.getElementById('selectCopyDestBtn');
    const copyDestPath = document.getElementById('copyDestPath');
    const copyDestTooltip = document.getElementById('copyDestTooltip');
    const addRuleBtn = document.getElementById('addRuleBtn');
    const rulesContainer = document.getElementById('rulesContainer');
    const noRulesMessage = document.getElementById('noRulesMessage');
    const ruleOperatorToggle = document.getElementById('ruleOperatorToggle');
    const organizeBtn = document.getElementById('organizeBtn');
    const fileCountSpan = document.getElementById('fileCount');
    const chartLegend = document.getElementById('chartLegend');
    const previewContainer = document.getElementById('previewContainer');
    const noFilesMessage = document.getElementById('noFilesMessage');
    const organizeByPrimarySelect = document.getElementById('organizeByPrimary');
    const organizeBySecondarySelect = document.getElementById('organizeBySecondary');
    const organizeOptionsContainer = document.getElementById('organizeOptionsContainer');
    const namingOptionsWrapper = document.getElementById('naming-options-wrapper');
    const toggleNamingOptionsBtn = document.getElementById('toggleNamingOptionsBtn');
    const namingOptionsChevron = document.getElementById('namingOptionsChevron');
    const operationRadios = document.querySelectorAll('input[name="operation-type"]');
    const deleteEmptyCheckbox = document.getElementById('deleteEmpty');
    const deleteEmptyLabel = document.getElementById('deleteEmptyLabel');
    const subfolderDepthInput = document.getElementById('subfolderDepth');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    const modalActions = document.getElementById('modalActions');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    const helpBtn = document.getElementById('help-btn');
    const aboutBtn = document.getElementById('about-btn');
    const findDuplicatesBtn = document.getElementById('findDuplicatesBtn');

    let fileChart = null;
    let previewDebounceTimer = null;

    // --- Theme Management ---
    const setTheme = (theme) => {
        state.theme = theme;
        localStorage.setItem('theme', theme);

        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            darkIcon.classList.add('hidden');
            lightIcon.classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            darkIcon.classList.remove('hidden');
            lightIcon.classList.add('hidden');
        }
        if (fileChart) {
            updateChart();
        }
    };

    themeToggleBtn.addEventListener('click', () => {
        setTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    // --- Modal Management ---
    const showModal = (title, content, status = 'confirm', isLoading) => {
        modalTitle.textContent = title;
        modalContent.innerHTML = content;
        const isResult = (status === 'success' || status === 'error' || status === 'info');

        const modalIcon = document.getElementById('modalIcon');
        if (status === 'success') {
            modalIcon.innerHTML = `<svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>`;
        } else if (status === 'error') {
            modalIcon.innerHTML = `<div class="error-icon bg-red-100 dark:bg-red-900/50 p-2 rounded-full"><svg class="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></div>`;
        } else {
            modalIcon.innerHTML = '';
        }

        modalActions.innerHTML = ''; // Clear previous buttons

        if (isResult) {
            if (status === 'success' && state.lastUndoLog && state.lastUndoLog.length > 0) {
                const undoBtn = document.createElement('button');
                undoBtn.id = 'modalUndoBtn';
                undoBtn.className = 'bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-all btn-press';
                undoBtn.innerHTML = '<i class="fa-solid fa-undo mr-2"></i>Undo';
                modalActions.appendChild(undoBtn);
            }
            const closeBtn = document.createElement('button');
            closeBtn.id = 'modalCloseBtn';
            closeBtn.className = 'w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-all btn-press';
            closeBtn.textContent = 'Close';
            modalActions.appendChild(closeBtn);
        } else {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'modalCancelBtn';
            cancelBtn.className = 'bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-all btn-press';
            cancelBtn.textContent = 'Cancel';

            const confirmBtn = document.createElement('button');
            confirmBtn.id = 'modalConfirmBtn';
            confirmBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-all btn-press';
            confirmBtn.textContent = 'Confirm';
            confirmBtn.disabled = isLoading;
            modalActions.appendChild(cancelBtn);
            modalActions.appendChild(confirmBtn);
        }
        modal.classList.remove('hidden');
    };



    const hideModal = () => {
        const wasSuccess = modalTitle.textContent === 'Organization Complete' || modalTitle.textContent === 'Undo Complete';
        modal.classList.add('hidden');
        if (wasSuccess) {
            scanFolder();
        }
    };

    const showLoadingState = (message) => {
        showModal(message, `<div class="flex justify-center items-center py-8"><i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i></div>`, 'loading', true);
    };

    // --- API Communication ---
    async function apiCall(endpoint, body) {
        try {
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(endpoint, options);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API call to ${endpoint} failed:`, error);
            showModal('API Error', `<p class="text-red-400">An error occurred: ${error.message}</p>`, 'error');
            return null;
        }
    }

    // --- Core Logic ---
    const handleFolderSelect = async () => {
        const result = await apiCall('/api/select-folder', {});
        if (result && result.success) {
            state.sourceFolderPath = result.path;
            sourcePath.textContent = result.path;
            sourceTooltip.textContent = result.path;
            await scanFolder();
        }
    };
    const handleCopyDestSelect = async () => {
        const result = await apiCall('/api/select-folder', {});
        if (result && result.success) {
            state.copyDestinationPath = result.path;
            copyDestPath.textContent = result.path;
            copyDestTooltip.textContent = result.path;
            updateFileCount();
        }
    };

    const scanFolder = async () => {
        if (!state.sourceFolderPath) return;
        showLoadingState('Scanning Folder & Metadata...');
        const result = await apiCall('/api/scan-folder', {
            path: state.sourceFolderPath,
            subfolderDepth: state.subfolderDepth
        });
        modal.classList.add('hidden');
        if (result && result.success) {
            state.allFiles = result.files;
            state.duplicatesScanned = false;
            state.duplicatesFromCache = false;
            state.lastUndoLog = null;

            const cachedDuplicates = localStorage.getItem(`duplicates_${state.sourceFolderPath}`);
            if (cachedDuplicates) {
                try {
                    const duplicateMap = new Map(JSON.parse(cachedDuplicates));
                    state.allFiles.forEach(file => {
                        if (duplicateMap.has(file.path)) {
                            file.is_duplicate = duplicateMap.get(file.path);
                        }
                    });
                    state.duplicatesScanned = true;
                    state.duplicatesFromCache = true;
                } catch (e) {
                    console.error("Failed to parse cached duplicates", e);
                    localStorage.removeItem(`duplicates_${state.sourceFolderPath}`);
                }
            }
            updateApp();
        } else {
            state.allFiles = [];
            state.filteredFiles = [];
            state.duplicatesScanned = false;
            state.duplicatesFromCache = false;
            state.lastUndoLog = null;
            updateApp();
        }
    };

    const handleFindDuplicates = async () => {
        if (state.allFiles.length === 0) return;
        const warningContent = `
            <p>Scanning for duplicates involves reading every file's content and can be very slow for large folders or many files.</p>
            <p class="mt-4">Are you sure you want to proceed?</p>
        `;
        showModal('Confirm Duplicate Scan', warningContent);
    };

    const runDuplicateScan = async () => {
        showLoadingState('Finding Duplicates...');
        const result = await apiCall('/api/find-duplicates', { files: state.allFiles });
        modal.classList.add('hidden');
        if (result && result.success) {
            state.allFiles = result.files;
            state.duplicatesScanned = true;
            state.duplicatesFromCache = false;

            try {
                const duplicateMap = state.allFiles.map(f => [f.path, f.is_duplicate]);
                localStorage.setItem(`duplicates_${state.sourceFolderPath}`, JSON.stringify(duplicateMap));
            } catch (e) {
                console.error("Failed to cache duplicate results:", e);
                showModal("Cache Warning", "Could not save duplicate scan results to browser storage. It might be full.", "info");
            }

            updateApp();

            const duplicates = state.allFiles.filter(file => file.is_duplicate);
            let reportContent;
            if (duplicates.length > 0) {
                reportContent = `<p>Found <strong>${duplicates.length} duplicate files</strong>.</p>`;
                showModal('Duplicate Scan Complete', reportContent, 'info');
            } else {
                reportContent = '<p>No duplicate files were found in the selected folder.</p>';
                showModal('Duplicate Scan Complete', reportContent, 'info');
            }
        }
    };

    const applyFilters = () => {
        if (state.rules.length === 0) {
            state.filteredFiles = [...state.allFiles];
            return;
        }
        state.filteredFiles = state.allFiles.filter(file => {
            if (state.ruleOperator === 'AND') {
                return state.rules.every(rule => checkFileAgainstRule(file, rule));
            } else {
                return state.rules.some(rule => checkFileAgainstRule(file, rule));
            }
        });
    };

    const wildCardToRegExp = (str) => {
        const escaped = str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    };

    const parseSizeToKb = (sizeStr) => {
        const sizeRegex = /^(-?\d+\.?\d*)\s*([kmgt]b?)?$/i;
        const match = sizeStr.match(sizeRegex);
        if (!match) return null;
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'kb').toLowerCase();
        if (unit.startsWith('t')) return value * 1024 * 1024 * 1024;
        if (unit.startsWith('g')) return value * 1024 * 1024;
        if (unit.startsWith('m')) return value * 1024;
        return value;
    };

    const checkFileAgainstRule = (file, rule) => {
        const prop = rule.property;
        const val = rule.value;

        if (prop === 'duplicates') {
            if (!state.duplicatesScanned) return false;
            const isDup = file.is_duplicate;
            return val === 'is_duplicate' ? isDup : !isDup;
        }

        const cond = rule.condition;

        if (prop === 'name' || prop === 'extension') {
            const subject = (prop === 'name')
                ? (file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name)
                : (file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.') + 1) : '');

            const regex = wildCardToRegExp(val);
            if (cond === 'is') return regex.test(subject);
            if (cond === 'is_not') return !regex.test(subject);
            const containsRegex = wildCardToRegExp(`*${val}*`);
            if (cond === 'contains') return containsRegex.test(subject);
            if (cond === 'not_contains') return !containsRegex.test(subject);
            if (cond === 'starts_with') return wildCardToRegExp(`${val}*`).test(subject);
            if (cond === 'ends_with') return wildCardToRegExp(`*${val}`).test(subject);
            return false;

        } else if (prop === 'size') {
            const sizeKB = file.size / 1024;
            const ruleValKb = parseSizeToKb(val);
            if (ruleValKb === null) return false;
            if (cond === 'greater_than') return sizeKB > ruleValKb;
            if (cond === 'less_than') return sizeKB < ruleValKb;
            if (cond === 'is') return Math.abs(sizeKB - ruleValKb) < 0.01;
            return false;
        } else if (prop === 'date') {
            try {
                const fileDate = new Date(file.lastModified * 1000).toISOString().split('T')[0];
                if (cond === 'greater_than') return fileDate > val;
                if (cond === 'less_than') return fileDate < val;
                if (cond === 'is') return fileDate === val;
            } catch (e) { return false; }
            return false;
        }
        return false;
    };

    // --- UI Update Functions ---
    const updateFiltersAndPreview = () => {
        applyFilters();
        updateChart();
        debouncedUpdatePreview();
        updateFileCount();
    };

    const updateApp = () => {
        updateFiltersAndPreview();
        renderRules();

        const dupBtnIcon = findDuplicatesBtn.querySelector('i');
        findDuplicatesBtn.innerHTML = '';
        findDuplicatesBtn.appendChild(dupBtnIcon);
        if (state.duplicatesFromCache) {
            findDuplicatesBtn.append(' Re-scan for Duplicates (Cached)');
        } else {
            findDuplicatesBtn.append(' Find Duplicates');
        }

        const duplicateOptions = document.querySelectorAll('option[value="duplicates"]');
        duplicateOptions.forEach(opt => {
            opt.disabled = !state.duplicatesScanned;
        });
    };

    const updateFileCount = () => {
        fileCountSpan.textContent = state.filteredFiles.length;
        const canOrganize = state.filteredFiles.length > 0 &&
            (state.operation === 'move' || (state.operation === 'copy' && state.copyDestinationPath));
        organizeBtn.disabled = !canOrganize;
        organizeBtn.classList.toggle('opacity-50', !canOrganize);
        organizeBtn.classList.toggle('cursor-not-allowed', !canOrganize);
    };

    const updateChart = () => {
        const data = processChartData(state.filteredFiles, state.organizeByPrimary);

        const isDarkMode = state.theme === 'dark';
        const chartBorderColor = isDarkMode ? '#374151' : '#f3f4f6';
        const tooltipBgColor = isDarkMode ? '#1f2937' : '#ffffff';
        const tooltipTitleColor = isDarkMode ? '#e5e7eb' : '#374151';
        const tooltipBodyColor = isDarkMode ? '#d1d5db' : '#4b5563';

        const chartData = {
            labels: data.labels,
            datasets: [{
                data: data.values,
                backgroundColor: data.colors,
                borderColor: chartBorderColor,
                borderWidth: 2,
            }]
        };

        if (fileChart) {
            fileChart.destroy();
        }

        const ctx = document.getElementById('fileChart').getContext('2d');
        fileChart = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: tooltipBgColor,
                        titleColor: tooltipTitleColor,
                        bodyColor: tooltipBodyColor,
                        callbacks: {
                            label: (context) => ` ${context.label || ''}: ${context.raw || 0} files`
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const clickedIndex = elements[0].index;
                        const clickedLabel = fileChart.data.labels[clickedIndex];

                        showLoadingState('Fetching file list...');

                        setTimeout(() => {
                            const relevantFiles = state.filteredFiles.filter(file => {
                                const sortedFiles = [...state.filteredFiles].sort((a, b) => a.name.localeCompare(b.name));
                                const fileIndex = sortedFiles.findIndex(f => f.path === file.path);
                                return getFolderName(file, state.organizeByPrimary, fileIndex) === clickedLabel;
                            });

                            const fileListHTML = relevantFiles.length > 0
                                ? `<ul class="text-left text-sm list-disc list-inside">${relevantFiles.map(f => `<li>${f.path}</li>`).join('')}</ul>`
                                : '<p>No files found for this category.</p>';

                            showModal(`Files in Category: ${clickedLabel}`, fileListHTML, 'info');

                            if (relevantFiles.length > 0) {
                                const exportBtn = document.createElement('button');
                                exportBtn.id = 'modalExportCsvBtn';
                                exportBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-all btn-press mr-auto';
                                exportBtn.innerHTML = '<i class="fa-solid fa-file-csv mr-2"></i>Export as CSV';

                                modalActions.prepend(exportBtn);

                                exportBtn.addEventListener('click', () => {
                                    const csvData = relevantFiles.map(file => {
                                        const nameWithoutExt = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
                                        const extension = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.') + 1) : '';
                                        return {
                                            Name: nameWithoutExt,
                                            Extension: extension,
                                            Path: file.path
                                        };
                                    });
                                    const filename = `${clickedLabel.replace(/[\s/\\?%*:"<>|]/g, '_')}_files.csv`;
                                    exportToCsv(filename, csvData);
                                });
                            }
                        }, 50);
                    }
                }
            }
        });
        updateLegend(data);
    };

    const processChartData = (files, criterion) => {
        const counts = {};
        const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
        sortedFiles.forEach((file, index) => {
            const folder = getFolderName(file, criterion, index);
            counts[folder] = (counts[folder] || 0) + 1;
        });
        const sortedEntries = Object.entries(counts).sort(([, a], [, b]) => b - a);
        return {
            labels: sortedEntries.map(e => e[0]),
            values: sortedEntries.map(e => e[1]),
            colors: generateColors(sortedEntries.length)
        };
    };

    const updateLegend = (data) => {
        chartLegend.innerHTML = data.labels.map((label, index) => `
        <div class="flex items-center">
            <span class="h-2 w-2 rounded-full mr-2" style="background-color: ${data.colors[index]}"></span>
            <span>${label} (${data.values[index]})</span>
        </div>`).join('');
    };

    const debouncedUpdatePreview = () => {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreview, 300);
    };

    const updatePreview = async () => {
        if (state.filteredFiles.length === 0) {
            noFilesMessage.classList.remove('hidden');
            noFilesMessage.innerHTML = state.sourceFolderPath
                ? `<i class="fa-regular fa-folder-open text-4xl mb-2"></i><p>No files match filters.</p>`
                : `<i class="fa-regular fa-file-excel text-4xl mb-2"></i><p>Select a folder to see preview.</p>`;
            previewContainer.innerHTML = '';
            previewContainer.appendChild(noFilesMessage);
            return;
        }

        noFilesMessage.classList.add('hidden');
        previewContainer.innerHTML = `<div class="flex justify-center items-center h-full"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i></div>`;

        const config = {
            filesToProcess: state.filteredFiles,
            organizeByPrimary: state.organizeByPrimary,
            organizeBySecondary: state.organizeBySecondary,
            organizationOptions: state.organizationOptions
        };

        const result = await apiCall('/api/preview-organization', config);

        if (result && result.success) {
            previewContainer.innerHTML = buildTreeHtml(result.tree);
        } else {
            previewContainer.innerHTML = `<div class="text-red-500">Failed to generate preview.</div>`;
        }
    };

    const buildTreeHtml = (tree) => {
        let html = '<ul class="space-y-1">';
        for (const primaryKey of Object.keys(tree).sort()) {
            html += `<li class="text-gray-800 dark:text-white"><i class="fas fa-folder text-yellow-500 dark:text-yellow-400 mr-2"></i>${primaryKey}`;
            const content = tree[primaryKey];
            if (Array.isArray(content)) {
                html += `<ul class="pl-4 border-l border-gray-300 dark:border-gray-700 ml-2 mt-1">`;
                content.sort().forEach(fileName => html += `<li class="text-gray-600 dark:text-gray-400"><i class="far fa-file mr-2"></i>${fileName}</li>`);
                html += `</ul>`;
            } else {
                html += `<ul class="pl-4 border-l border-gray-300 dark:border-gray-700 ml-2 mt-1">`;
                for (const secondaryKey of Object.keys(content).sort()) {
                    html += `<li class="text-gray-700 dark:text-gray-300"><i class="fas fa-folder text-yellow-600 dark:text-yellow-500 mr-2"></i>${secondaryKey}`;
                    html += `<ul class="pl-4 border-l border-gray-400 dark:border-gray-600 ml-2 mt-1">`;
                    content[secondaryKey].sort().forEach(fileName => html += `<li class="text-gray-600 dark:text-gray-400"><i class="far fa-file mr-2"></i>${fileName}</li>`);
                    html += `</ul></li>`;
                }
                html += `</ul>`;
            }
            html += `</li>`;
        }
        return html + '</ul>';
    };

    // --- Rule Management ---
    const addRule = () => {
        const ruleId = `rule-${Date.now()}`;
        state.rules.push({ id: ruleId, property: 'name', condition: 'contains', value: '' });
        updateApp();
    };

    const deleteRule = (id) => {
        const ruleElement = document.getElementById(id);
        if (ruleElement) {
            ruleElement.classList.add('rule-exit');
            ruleElement.addEventListener('animationend', () => {
                state.rules = state.rules.filter(rule => rule.id !== id);
                updateApp();
            }, { once: true });
        }
    };

    const updateRule = (id, field, value, rerenderRule = false) => {
        const rule = state.rules.find(r => r.id === id);
        if (rule) {
            rule[field] = value;
            if (field === 'property') {
                const conditions = getConditionsForProperty(value);
                rule.condition = conditions[0].value;
                if (value === 'duplicates') {
                    rule.value = 'is_duplicate';
                } else {
                    rule.value = '';
                }
            }
            if (rerenderRule) {
                updateApp();
            } else {
                updateFiltersAndPreview();
            }
        }
    };

    const renderRules = () => {
        noRulesMessage.classList.toggle('hidden', state.rules.length > 0);
        if (state.rules.length === 0) {
            rulesContainer.innerHTML = ''; rulesContainer.appendChild(noRulesMessage); return;
        }
        state.rules.forEach(rule => {
            if (document.getElementById(rule.id)) return;
            const ruleEl = document.createElement('div');
            ruleEl.id = rule.id;
            ruleEl.className = 'grid grid-cols-12 gap-2 items-center p-2 bg-gray-100 dark:bg-gray-800 rounded-md rule-enter';
            rulesContainer.appendChild(ruleEl);
        });
        Array.from(rulesContainer.children).forEach(child => {
            if (child.id && !state.rules.some(r => r.id === child.id)) child.remove();
        });

        state.rules.forEach(rule => {
            const ruleEl = document.getElementById(rule.id);
            const propertyOptions = `
            <option value="name" ${rule.property === 'name' ? 'selected' : ''}>Name</option>
            <option value="extension" ${rule.property === 'extension' ? 'selected' : ''}>Extension</option>
            <option value="size" ${rule.property === 'size' ? 'selected' : ''}>Size</option>
            <option value="date" ${rule.property === 'date' ? 'selected' : ''}>Date</option>
            <option value="duplicates" ${rule.property === 'duplicates' ? 'selected' : ''} ${!state.duplicatesScanned ? 'disabled' : ''}>Duplicates</option>`;

            const conditionOptions = getConditionsForProperty(rule.property).map(c =>
                `<option value="${c.value}" ${rule.condition === c.value ? 'selected' : ''}>${c.label}</option>`).join('');

            const baseInputClasses = 'w-full bg-gray-200 dark:bg-gray-700 p-1 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-500 focus:outline-none';
            let valueInputHTML = '';
            if (rule.property === 'duplicates') {
                valueInputHTML = `<select data-field="value" class="col-span-12 md:col-span-8 ${baseInputClasses}">
                <option value="is_duplicate" ${rule.value === 'is_duplicate' ? 'selected' : ''}>is a duplicate</option>
                <option value="is_unique" ${rule.value === 'is_unique' ? 'selected' : ''}>is unique</option>
            </select>`;
            } else {
                const valueInputType = rule.property === 'date' ? 'date' : 'text';
                const valuePlaceholder = rule.property === 'size' ? 'e.g., 500 KB, 1.5 GB' : 'Value';
                valueInputHTML = `<input data-field="value" type="${valueInputType}" value="${rule.value}" class="col-span-12 md:col-span-4 ${baseInputClasses}" placeholder="${valuePlaceholder}">`;
            }

            const conditionHTML = `<select data-field="condition" class="col-span-6 md:col-span-4 ${baseInputClasses}" ${rule.property === 'duplicates' ? 'style="display:none;"' : ''}>${conditionOptions}</select>`;

            ruleEl.innerHTML = `
            <select data-field="property" class="col-span-6 md:col-span-3 ${baseInputClasses}">${propertyOptions}</select>
            ${rule.property !== 'duplicates' ? conditionHTML : '<div class="col-span-6 md:col-span-4"></div>'}
            ${valueInputHTML}
            <button data-action="delete" class="col-span-12 md:col-span-1 flex items-center justify-center text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-all"><i class="fas fa-trash-alt"></i></button>
        `;
        });
    };

    rulesContainer.addEventListener('change', (e) => {
        const target = e.target;
        const ruleEl = target.closest('[id^="rule-"]');
        if (!ruleEl) return;

        const field = target.dataset.field;
        if (field) {
            updateRule(ruleEl.id, field, target.value, true);
        }
    });
    rulesContainer.addEventListener('input', (e) => {
        const target = e.target;
        const ruleEl = target.closest('[id^="rule-"]');
        if (!ruleEl || target.dataset.field !== 'value') return;
        updateRule(ruleEl.id, 'value', target.value, false);
    });
    rulesContainer.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target || target.dataset.action !== 'delete') return;
        const ruleEl = target.closest('[id^="rule-"]');
        if (ruleEl) deleteRule(ruleEl.id);
    });

    // --- Organization & Modal ---
    const handleOrganizeClick = () => {
        const { operation, filteredFiles, sourceFolderPath, copyDestinationPath, organizeByPrimary, organizeBySecondary, deleteEmptyFolders } = state;
        const targetPath = operation === 'move' ? sourceFolderPath : copyDestinationPath;

        let summary = `<p>You are about to <strong>${operation.toUpperCase()} ${filteredFiles.length} files</strong>.</p>
                       <p><strong>Source:</strong> <span class="font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded-md my-2 text-blue-600 dark:text-blue-300">${sourceFolderPath}</span></p>
                       <p><strong>Destination:</strong> <span class="font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded-md my-2 text-indigo-600 dark:text-indigo-300">${targetPath}</span></p>
                       <p>Files will be organized by <strong>${organizeByPrimary}</strong>, then by <strong>${organizeBySecondary}</strong>.</p>`;

        if (deleteEmptyFolders && operation === 'move') {
            summary += `<p class="mt-2 text-yellow-500 dark:text-yellow-400">After moving, any source folders that become empty will be <strong>deleted</strong>.</p>`;
        }
        summary += `<p class="mt-4 border-t border-gray-300 dark:border-gray-600 pt-2">Are you sure you want to proceed?</p>`;

        showModal('Confirm Organization', summary);
    };

    const confirmOrganization = async () => {
        hideModal();
        showLoadingState('Organizing files...');
        const { operation, sourceFolderPath, copyDestinationPath, filteredFiles, deleteEmptyFolders, organizeByPrimary, organizeBySecondary, organizationOptions } = state;

        const config = {
            sourceDirectory: sourceFolderPath,
            targetDirectory: operation === 'move' ? sourceFolderPath : copyDestinationPath,
            filesToProcess: filteredFiles,
            operation: operation,
            deleteEmptyFolders: deleteEmptyFolders,
            organizeByPrimary: organizeByPrimary,
            organizeBySecondary: organizeBySecondary,
            organizationOptions: organizationOptions
        };

        const result = await apiCall('/api/organize', config);

        modal.classList.add('hidden');
        if (result && result.success) {
            state.lastUndoLog = result.undo_log;
            showModal('Organization Complete', `<pre class="text-sm whitespace-pre-wrap">${result.log.join('\n')}</pre>`, 'success');
        } else {
            state.lastUndoLog = null;
            showModal('Organization Failed', `<p class="text-red-400">${result ? result.error : 'An unknown error occurred.'}</p>`, 'error');
        }
    };

    const confirmUndo = async () => {
        hideModal();
        showLoadingState('Undoing changes...');
        const { sourceFolderPath, copyDestinationPath, operation } = state;
        const targetDirectory = operation === 'move' ? sourceFolderPath : copyDestinationPath;

        const result = await apiCall('/api/undo', { undo_log: state.lastUndoLog, targetDirectory });
        modal.classList.add('hidden');

        if (result && result.success) {
            state.lastUndoLog = null;
            showModal('Undo Complete', `<pre class="text-sm whitespace-pre-wrap">${result.log.join('\n')}</pre>`, 'success');
        } else {
            showModal('Undo Failed', `<p class="text-red-400">${result ? result.error : 'An unknown error occurred.'}</p>`, 'error');
        }
    };


    // --- Helpers ---
    const exportToCsv = (filename, rows) => {
        if (!rows || rows.length === 0) {
            return;
        }
        const separator = ',';
        const keys = Object.keys(rows[0]);
        const csvContent =
            keys.join(separator) +
            '\n' +
            rows.map(row => {
                return keys.map(k => {
                    let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                    cell = cell instanceof Date
                        ? cell.toLocaleString()
                        : cell.toString().replace(/"/g, '""');
                    if (cell.search(/("|,|\n)/g) >= 0) {
                        cell = `"${cell}"`;
                    }
                    return cell;
                }).join(separator);
            }).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const getConditionsForProperty = (prop) => {
        const textConditions = [
            { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'does not contain' },
            { value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' },
            { value: 'starts_with', label: 'starts with' }, { value: 'ends_with', label: 'ends with' }
        ];
        const numericConditions = [
            { value: 'greater_than', label: 'is >' }, { value: 'less_than', label: 'is <' },
            { value: 'is', label: 'is =' }
        ];
        if (prop === 'duplicates') return [{ value: 'is', label: 'is' }];
        return (prop === 'size' || prop === 'date') ? numericConditions : textConditions;
    };

    const getFolderName = (file, criterion, index = -1) => {
        const meta = file.metadata || {};
        const modifiedDate = new Date(file.lastModified * 1000);
        const createdDate = file.dateCreated ? new Date(file.dateCreated * 1000) : modifiedDate;

        const formatDate = (date, format) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            if (format === 'yyyy') return yyyy.toString();
            if (format === 'yyyy-mm') return `${yyyy}-${mm}`;
            if (format === 'yyyy-mm-dd') return `${yyyy}-${mm}-${dd}`;
            if (format === 'mm-dd') return `${mm}-${dd}`;
            if (format === 'dd') return dd;
            return '';
        };

        switch (criterion) {
            case 'type': return getFileCategory(file.name);
            case 'extension':
                const extIndex = file.name.lastIndexOf('.');
                const ext = extIndex !== -1 ? file.name.substring(extIndex + 1).toUpperCase() : 'No Extension';
                return ext === 'No Extension' ? ext : `${ext} Files`;
            case 'date_modified_yyyy': return formatDate(modifiedDate, 'yyyy');
            case 'date_modified_yyyy_mm': return formatDate(modifiedDate, 'yyyy-mm');
            case 'date_modified_yyyy_mm_dd': return formatDate(modifiedDate, 'yyyy-mm-dd');
            case 'date_modified_mm_dd': return formatDate(modifiedDate, 'mm-dd');
            case 'date_modified_dd': return formatDate(modifiedDate, 'dd');
            case 'date_created_yyyy': return formatDate(createdDate, 'yyyy');
            case 'date_created_yyyy_mm': return formatDate(createdDate, 'yyyy-mm');
            case 'date_created_yyyy_mm_dd': return formatDate(createdDate, 'yyyy-mm-dd');
            case 'date_created_mm_dd': return formatDate(createdDate, 'mm-dd');
            case 'date_created_dd': return formatDate(createdDate, 'dd');
            case 'alphabet':
                const firstChar = file.name[0].toUpperCase();
                return /[A-Z]/.test(firstChar) ? firstChar : '#';
            case 'size':
                const sizeKB = file.size / 1024;
                if (sizeKB < 100) return "Tiny (0 KB - 100 KB)";
                if (sizeKB < 1024) return "Small (100KB - 1MB)";
                if (sizeKB < 102400) return "Medium (1MB - 100MB)";
                return "Large (100MB plus)";
            case 'duplicates':
                if (!state.duplicatesScanned) return "Duplicates (Not Scanned)";
                return file.is_duplicate ? "Duplicate Files" : "Unique Files";
            case 'files_per_folder': {
                if (index === -1) return "Files per Folder";
                const batchSize = state.organizationOptions.files_per_folder;
                const start = Math.floor(index / batchSize) * batchSize + 1;
                const end = start + batchSize - 1;
                return `${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}`;
            }
            case 'first_n_chars': {
                const n = state.organizationOptions.first_n_chars;
                const filename = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
                return filename.substring(0, n) || "---";
            }
            case 'music_artist': return meta.artist || 'Unknown Artist';
            case 'music_album': return meta.album || 'Unknown Album';
            case 'music_year': return meta.year || 'Unknown Year';
            case 'music_year_album': {
                const year = meta.year || 'Unknown Year';
                const album = meta.album || 'Unknown Album';
                return `${year} - ${album}`;
            }
            case 'video_year': return meta.year || 'Unknown Year';
            case 'photo_camera_make_model': return meta.camera || 'Unknown Camera';
            case 'photo_year_month': return meta.year_month || 'Unknown Date';
            default: return 'Uncategorized';
        }
    };

    const getFileCategory = (filename) => {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const categories = {
            Images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'cr2', 'nef', 'arw'],
            Videos: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'],
            Audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'],
            Documents: ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'md'],
            Spreadsheets: ['xls', 'xlsx', 'ods', 'csv'],
            Presentations: ['ppt', 'pptx', 'odp'],
            Ebooks: ['epub', 'mobi'],
            Archives: ['zip', 'rar', '7z', 'gz', 'tar'],
            'Executables & Installers': ['exe', 'dmg', 'msi', 'jar', 'bat'],
            'Code & Scripts': ['py', 'js', 'html', 'css', 'json', 'xml', 'java', 'c', 'cpp', 'sql', 'sh'],
            Fonts: ['otf', 'ttf', 'woff', 'woff2'],
            '3D Models': ['obj', 'stl', 'fbx', 'gltf', 'glb']
        };
        for (const category in categories) {
            if (categories[category].includes(ext)) return category;
        }
        return 'Other Files';
    };

    const generateColors = (numColors) => {
        const baseColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
        const colors = [];
        for (let i = 0; i < numColors; i++) {
            colors.push(baseColors[i % baseColors.length]);
        }
        return colors;
    };

    const renderOrganizeOptions = () => {
        const criterion = state.organizeByPrimary;
        organizeOptionsContainer.innerHTML = '';
        let inputHTML = '';
        if (criterion === 'files_per_folder') {
            inputHTML = `
                <label for="filesPerFolderInput" class="text-sm mr-1">Batch Size:</label>
                <input type="number" id="filesPerFolderInput" value="${state.organizationOptions.files_per_folder}" min="1" class="w-20 bg-gray-200 dark:bg-gray-700 p-1 rounded-md text-center">
            `;
        } else if (criterion === 'first_n_chars') {
            inputHTML = `
                <label for="firstNCharsInput" class="text-sm mr-1">Chars:</label>
                <input type="number" id="firstNCharsInput" value="${state.organizationOptions.first_n_chars}" min="1" class="w-16 bg-gray-200 dark:bg-gray-700 p-1 rounded-md text-center">
            `;
        }
        organizeOptionsContainer.innerHTML = inputHTML;
    };


    // --- Event Listeners ---
    selectFolderBtn.addEventListener('click', handleFolderSelect);
    selectCopyDestBtn.addEventListener('click', handleCopyDestSelect);
    addRuleBtn.addEventListener('click', addRule);
    findDuplicatesBtn.addEventListener('click', handleFindDuplicates);

    toggleNamingOptionsBtn.addEventListener('click', () => {
        namingOptionsWrapper.classList.toggle('expanded');
        namingOptionsChevron.classList.toggle('rotate-180');
    });

    document.getElementById('folderPrefix').addEventListener('input', (e) => { state.organizationOptions.folderPrefix = e.target.value; debouncedUpdatePreview(); });
    document.getElementById('folderSuffix').addEventListener('input', (e) => { state.organizationOptions.folderSuffix = e.target.value; debouncedUpdatePreview(); });
    document.getElementById('filenamePrefix').addEventListener('input', (e) => { state.organizationOptions.filenamePrefix = e.target.value; debouncedUpdatePreview(); });
    document.getElementById('filenameSuffix').addEventListener('input', (e) => { state.organizationOptions.filenameSuffix = e.target.value; debouncedUpdatePreview(); });
    document.getElementById('filenameIncrementalPrefix').addEventListener('change', (e) => { state.organizationOptions.filenameIncrementalPrefix = e.target.checked; debouncedUpdatePreview(); });
    document.getElementById('filenameIncrementalSuffix').addEventListener('change', (e) => { state.organizationOptions.filenameIncrementalSuffix = e.target.checked; debouncedUpdatePreview(); });


    const updateOperatorToggleUI = () => {
        const buttons = ruleOperatorToggle.querySelectorAll('.operator-btn');
        buttons.forEach(btn => {
            const isActive = btn.dataset.value === state.ruleOperator;
            btn.classList.toggle('bg-blue-600', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-gray-700', !isActive);
            btn.classList.toggle('dark:text-gray-300', !isActive);
            btn.classList.toggle('hover:bg-gray-300', !isActive);
            btn.classList.toggle('dark:hover:bg-gray-600', !isActive);
        });
    };

    ruleOperatorToggle.addEventListener('click', (e) => {
        const button = e.target.closest('.operator-btn');
        if (!button || button.dataset.value === state.ruleOperator) return;
        state.ruleOperator = button.dataset.value;
        updateOperatorToggleUI();
        updateFiltersAndPreview();
    });

    organizeBtn.addEventListener('click', handleOrganizeClick);
    organizeByPrimarySelect.addEventListener('change', (e) => {
        state.organizeByPrimary = e.target.value;

        const advancedOptions = ['files_per_folder', 'first_n_chars'];
        if (advancedOptions.includes(state.organizeByPrimary)) {
            organizeBySecondarySelect.value = 'none';
            state.organizeBySecondary = 'none';
            organizeBySecondarySelect.disabled = true;
            organizeBySecondarySelect.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            organizeBySecondarySelect.disabled = false;
            organizeBySecondarySelect.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        renderOrganizeOptions();
        updateChart();
        debouncedUpdatePreview();
    });
    organizeOptionsContainer.addEventListener('change', (e) => {
        if (e.target.id === 'filesPerFolderInput') {
            state.organizationOptions.files_per_folder = parseInt(e.target.value, 10) || 100;
        } else if (e.target.id === 'firstNCharsInput') {
            state.organizationOptions.first_n_chars = parseInt(e.target.value, 10) || 3;
        }
        updateChart();
        debouncedUpdatePreview();
    });
    organizeBySecondarySelect.addEventListener('change', (e) => {
        state.organizeBySecondary = e.target.value;
        debouncedUpdatePreview();
    });
    operationRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.operation = e.target.value;
            const isMove = state.operation === 'move';

            deleteEmptyCheckbox.disabled = !isMove;
            deleteEmptyLabel.classList.toggle('text-gray-500', !isMove);
            if (isMove) {
                deleteEmptyCheckbox.checked = state.deleteEmptyFolders = true;
            } else {
                deleteEmptyCheckbox.checked = state.deleteEmptyFolders = false;
            }
            copyDestWrapper.classList.toggle('expanded', !isMove);
            updateFileCount();
        });
    });
    deleteEmptyCheckbox.addEventListener('change', (e) => { state.deleteEmptyFolders = e.target.checked; });
    subfolderDepthInput.addEventListener('change', (e) => {
        const depth = parseInt(e.target.value, 10);
        state.subfolderDepth = isNaN(depth) ? 0 : depth;
        scanFolder();
    });

    modalActions.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'modalCloseBtn' || e.target.id === 'modalCancelBtn')) {
            hideModal();
        }
        if (e.target && e.target.id === 'modalConfirmBtn') {
            if (modalTitle.textContent === 'Confirm Duplicate Scan') {
                hideModal();
                runDuplicateScan();
            } else {
                confirmOrganization();
            }
        }
        if (e.target && e.target.id === 'modalUndoBtn') {
            confirmUndo();
        }
    });

    helpBtn.addEventListener('click', () => {
        if (modalContentData && modalContentData.help) {
            showModal(modalContentData.help.title, modalContentData.help.content, 'info');
        } else {
            showModal('How to Use', 'Help content could not be loaded.', 'info');
        }
    });

    aboutBtn.addEventListener('click', () => {
        if (modalContentData && modalContentData.about) {
            let content = modalContentData.about.content
                .replace('{version}', modalContentData.about.version)
                .replace('{author}', modalContentData.about.author);
            showModal(modalContentData.about.title, content, 'info');
        } else {
            showModal('About', 'About information could not be loaded.', 'info');
        }
    });

    // --- Initial Setup ---
    const checkDependenciesAndInit = async () => {
        // Fetch modal content first
        try {
            const response = await fetch('/api/get-content', { method: 'GET' });
            const data = await response.json();
            if (data.success) {
                modalContentData = data.data;
            } else {
                console.error("Failed to load modal content:", data.error);
            }
        } catch (e) {
            console.error("Could not fetch modal content.", e);
        }

        try {
            const response = await fetch('/api/check-dependencies', { method: 'GET' });
            const data = await response.json();
            if (data.success) {
                const musicOptions = document.querySelectorAll('#organizeByPrimary optgroup[label="Music Metadata"] option, #organizeBySecondary optgroup[label="Music Metadata"] option');
                const videoOptions = document.querySelectorAll('#organizeByPrimary optgroup[label="Video Metadata"] option, #organizeBySecondary optgroup[label="Video Metadata"] option');
                const photoOptions = document.querySelectorAll('#organizeByPrimary optgroup[label="Photo Metadata"] option, #organizeBySecondary optgroup[label="Photo Metadata"] option');

                if (!data.dependencies.mutagen) {
                    musicOptions.forEach(opt => {
                        opt.disabled = true;
                        opt.textContent += " (missing library)";
                    });
                }
                if (!data.dependencies.pymediainfo) {
                    videoOptions.forEach(opt => {
                        opt.disabled = true;
                        opt.textContent += " (missing library)";
                    });
                }
                if (!data.dependencies.exifread) {
                    photoOptions.forEach(opt => {
                        opt.disabled = true;
                        opt.textContent += " (missing library)";
                    });
                }
            }
        } catch (e) {
            console.error("Could not check for backend dependencies.", e);
        }

        const initialTheme = localStorage.getItem('theme') ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(initialTheme);
        updateApp();
        updateOperatorToggleUI();
        document.querySelector('#op-copy').dispatchEvent(new Event('change'));
        renderOrganizeOptions();
    };

    checkDependenciesAndInit();
});

